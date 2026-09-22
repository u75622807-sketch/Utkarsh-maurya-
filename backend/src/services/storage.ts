// File storage abstraction: local disk (dev) / S3 (prod).
// Serve path kabhi express.static nahi — hamesha auth+owner-check+stream (doc 06).

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Readable } from 'node:stream';
import { config } from '../config';
import { logger } from '../logger';

export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

export interface FileStorage {
  readonly driver: 'local' | 's3';
  save(input: { userId: string; originalName: string; mime: string; buffer: Buffer }): Promise<StoredObject>;
  readBuffer(storageKey: string): Promise<Buffer>;
  readStream(storageKey: string): Promise<Readable>;
  remove(storageKey: string): Promise<void>;
}

function safeBase(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

export class LocalStorage implements FileStorage {
  readonly driver = 'local' as const;
  private base: string;

  constructor(baseDir?: string) {
    this.base = baseDir ?? config.uploadDir;
    mkdirSync(this.base, { recursive: true });
  }

  private fullPath(key: string): string {
    // traversal guard: key hamesha `<uuid>-<safe>` flat file
    const base = basename(key);
    if (base !== key || key.includes('..')) throw new Error('Invalid storage key');
    return join(this.base, base);
  }

  async save(input: { userId: string; originalName: string; mime: string; buffer: Buffer }): Promise<StoredObject> {
    const key = `${randomUUID()}-${safeBase(input.originalName)}`;
    const full = this.fullPath(key);
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(full, { mode: 0o600 });
      ws.on('error', reject);
      ws.on('finish', () => resolve());
      ws.end(input.buffer);
    });
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');
    return { storageKey: key, sizeBytes: input.buffer.length, sha256 };
  }

  async readBuffer(storageKey: string): Promise<Buffer> {
    const { readFile } = await import('node:fs/promises');
    return readFile(this.fullPath(storageKey));
  }

  async readStream(storageKey: string): Promise<Readable> {
    return createReadStream(this.fullPath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    try {
      const p = this.fullPath(storageKey);
      if (existsSync(p)) unlinkSync(p);
    } catch (err) {
      logger.warn('local storage remove failed', { err: String(err) });
    }
  }
}

// S3 driver — optional peer `@aws-sdk/client-s3` (prod deploys par `npm i @aws-sdk/client-s3`).
// Dynamic import taaki dev install halka rahe; missing SDK par clear error.
export class S3Storage implements FileStorage {
  readonly driver = 's3' as const;
  private client: unknown = null;

  private async getClient(): Promise<{
    send: (cmd: unknown) => Promise<unknown>;
    cmds: { PutObjectCommand: new (i: never) => unknown; GetObjectCommand: new (i: never) => unknown; DeleteObjectCommand: new (i: never) => unknown };
  }> {
    if (this.client) return this.client as never;
    let mod: Record<string, unknown>;
    try {
      mod = (await import('@aws-sdk/client-s3')) as Record<string, unknown>;
    } catch {
      throw new Error(
        'S3 driver needs `@aws-sdk/client-s3` (npm i @aws-sdk/client-s3) + S3_* env. See docs/10-deployment.md.',
      );
    }
    const S3Client = mod.S3Client as new (o: never) => { send: (c: unknown) => Promise<unknown> };
    this.client = {
      send: (cmd: unknown) =>
        new S3Client({
          region: config.s3.region,
          endpoint: config.s3.endpoint || undefined,
          credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
          forcePathStyle: Boolean(config.s3.endpoint),
        } as never).send(cmd),
      cmds: {
        PutObjectCommand: mod.PutObjectCommand as never,
        GetObjectCommand: mod.GetObjectCommand as never,
        DeleteObjectCommand: mod.DeleteObjectCommand as never,
      },
    };
    return this.getClient();
  }

  async save(input: { userId: string; originalName: string; mime: string; buffer: Buffer }): Promise<StoredObject> {
    const { send, cmds } = await this.getClient();
    const key = `${input.userId}/${randomUUID()}-${safeBase(input.originalName)}`;
    await send(new cmds.PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: input.buffer, ContentType: input.mime } as never));
    return { storageKey: key, sizeBytes: input.buffer.length, sha256: createHash('sha256').update(input.buffer).digest('hex') };
  }

  async readBuffer(storageKey: string): Promise<Buffer> {
    const { send, cmds } = await this.getClient();
    const out = (await send(new cmds.GetObjectCommand({ Bucket: config.s3.bucket, Key: storageKey } as never))) as {
      Body?: { transformToByteArray?: () => Promise<Uint8Array> };
    };
    if (!out.Body?.transformToByteArray) throw new Error('S3 Body unreadable');
    return Buffer.from(await out.Body.transformToByteArray());
  }

  async readStream(storageKey: string): Promise<Readable> {
    const buf = await this.readBuffer(storageKey);
    const { Readable: R } = await import('node:stream');
    return R.from(buf);
  }

  async remove(storageKey: string): Promise<void> {
    const { send, cmds } = await this.getClient();
    await send(new cmds.DeleteObjectCommand({ Bucket: config.s3.bucket, Key: storageKey } as never));
  }
}

let cached: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (!cached) {
    cached = config.storageDriver === 's3' ? new S3Storage() : new LocalStorage();
  }
  return cached;
}

/** Tests ke liye override (temp dir). */
export function __setStorage(s: FileStorage | null): void {
  cached = s;
}

// ---------------------------------------------------------------- file validation

/** Magic-byte sniff — extension/MIME spoof pakadne ke liye (doc 08-T4). */
export function sniffKind(buf: Buffer): 'pdf' | 'png' | 'jpeg' | 'text' | 'unknown' {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  // text: pehle 4KB me NUL/control (bina \t\n\r) nahi hona chahiye
  const head = buf.subarray(0, Math.min(buf.length, 4096));
  for (const b of head) {
    if (b === 0x00) return 'unknown';
    if (b < 0x09 || (b > 0x0d && b < 0x20)) return 'unknown';
  }
  return 'text';
}

const MIME_TO_KINDS: Record<string, Array<'pdf' | 'png' | 'jpeg' | 'text'>> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpeg'],
  'text/plain': ['text'],
  'text/markdown': ['text'],
};

/** Returns error message ya null (ok). */
export function validateUpload(mime: string, buffer: Buffer, allowed: string[]): string | null {
  if (!allowed.includes(mime)) return `File type '${mime}' is not allowed`;
  const kinds = MIME_TO_KINDS[mime];
  if (!kinds) return `File type '${mime}' is not allowed`;
  const kind = sniffKind(buffer);
  if (!kinds.includes(kind as 'pdf')) {
    return `File content does not match declared type '${mime}'`;
  }
  return null;
}
