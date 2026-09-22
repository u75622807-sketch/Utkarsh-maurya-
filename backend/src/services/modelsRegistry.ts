// Server-side model allowlist (doc 08-T7: client-forged model reject).
// Cost = rate-card × tokens, hamesha "estimate" label ke saath.

import { config } from '../config';
import { badRequest } from '../utils/errors';

export type ModelProvider = 'mock' | 'openai' | 'anthropic';

export interface ModelInfo {
  id: string;
  label: string;
  provider: ModelProvider;
  contextWindow: number;
  maxOutput: number;
  costPer1k: { in: number; out: number }; // USD per 1k tokens
  enabled: boolean;
  description: string;
}

const CATALOG: Array<Omit<ModelInfo, 'enabled'>> = [
  {
    id: 'mock-1',
    label: 'UtkForce Mock (dev/test)',
    provider: 'mock',
    contextWindow: 8192,
    maxOutput: 1024,
    costPer1k: { in: 0, out: 0 },
    description: 'Deterministic offline provider — bina API key ke development aur tests ke liye.',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 4096,
    costPer1k: { in: 0.00015, out: 0.0006 },
    description: 'Fast + cheap OpenAI model, day-to-day chat ke liye.',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 4096,
    costPer1k: { in: 0.0025, out: 0.01 },
    description: 'Flagship OpenAI model, complex reasoning ke liye.',
  },
  {
    id: 'claude-3-5-haiku-20241022',
    label: 'Claude Haiku 3.5',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 4096,
    costPer1k: { in: 0.0008, out: 0.004 },
    description: 'Fast Anthropic model.',
  },
  {
    id: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 4096,
    costPer1k: { in: 0.003, out: 0.015 },
    description: 'Flagship Anthropic model.',
  },
];

export function listModels(): ModelInfo[] {
  return CATALOG.map((m) => ({
    ...m,
    enabled:
      m.provider === 'mock'
        ? config.aiProvider === 'mock'
        : m.provider === 'openai'
          ? config.openaiKey.length > 0
          : config.anthropicKey.length > 0,
  }));
}

export function getModel(id: string): ModelInfo | null {
  return listModels().find((m) => m.id === id) ?? null;
}

/** Model exist + enabled hai? Nahi to 400 (cost-abuse guard). */
export function assertModelAllowed(id: string): ModelInfo {
  const m = getModel(id);
  if (!m) throw badRequest(`Unknown model: ${id}`);
  if (!m.enabled) {
    throw badRequest(`Model '${id}' is not enabled on this server (missing provider key?)`);
  }
  return m;
}

export function estimateCost(model: ModelInfo, promptTokens: number, completionTokens: number): number {
  const cost = (promptTokens / 1000) * model.costPer1k.in + (completionTokens / 1000) * model.costPer1k.out;
  return Math.round(cost * 1e6) / 1e6;
}

/** Crude token estimate (chars/4) — sirf mock/quota-guard ke liye, billing truth provider usage hai. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
