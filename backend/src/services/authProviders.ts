// AuthProvider abstraction — Google OIDC baad me bina refactor ke (doc 05 §2).
// Local implemented; Google = stub (501) + frozen linking policy.

import bcrypt from 'bcryptjs';
import { AppError } from '../utils/errors';

export type ProviderId = 'local' | 'google';

export interface ExternalIdentity {
  provider: Exclude<ProviderId, 'local'>;
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
}

export interface AuthProvider {
  readonly id: ProviderId;
  beginLogin(input: unknown): Promise<{ redirectUrl: string; state: string }>;
  handleCallback(query: unknown): Promise<ExternalIdentity>;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Google OIDC (Phase-2). Wiring estimate ~80 lines + 3 tests; policy doc 05 §2 me frozen. */
export class GoogleAuthProvider implements AuthProvider {
  readonly id = 'google' as const;

  async beginLogin(_input: unknown): Promise<{ redirectUrl: string; state: string }> {
    throw new AppError(
      501,
      'AUTH_PROVIDER_NOT_ENABLED',
      'Google login is not enabled yet — see docs/05-auth-design.md §2 for the integration plan.',
    );
  }

  async handleCallback(_query: unknown): Promise<ExternalIdentity> {
    throw new AppError(
      501,
      'AUTH_PROVIDER_NOT_ENABLED',
      'Google login is not enabled yet — see docs/05-auth-design.md §2 for the integration plan.',
    );
  }
}

export function getAuthProvider(id: ProviderId): AuthProvider {
  if (id === 'google') return new GoogleAuthProvider();
  throw new AppError(400, 'VALIDATION_ERROR', `Unknown auth provider: ${id}`);
}
