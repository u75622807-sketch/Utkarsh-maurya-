// Token metering + daily quota (doc 08-T7). Billing truth = provider usage;
// mock me estimate. Race note: check-then-act hai — strict atomicity Phase-2
// (single-flight per user ya SQL advisory lock). Overrun bounded: 1 request.

import { config } from '../config';
import type { Store } from '../db/store';
import { quotaExceeded } from '../utils/errors';
import { assertModelAllowed, estimateCost } from './modelsRegistry';

export interface QuotaStatus {
  limit: number;
  used: number;
  remaining: number;
}

export async function checkQuota(store: Store, userId: string): Promise<QuotaStatus> {
  const limit = config.dailyTokenQuota;
  const since = new Date(Date.now() - 86400000).toISOString();
  const used = await store.tokensUsedSince(userId, since);
  const remaining = Math.max(0, limit - used);
  if (used >= limit) {
    throw quotaExceeded(`Daily token quota exceeded (${used}/${limit}). Try again tomorrow.`, {
      quota: { limit, used, remaining: 0 },
    });
  }
  return { limit, used, remaining };
}

export async function recordUsage(
  store: Store,
  input: {
    userId: string;
    conversationId: string | null;
    model: string;
    promptTokens: number;
    completionTokens: number;
  },
): Promise<{ promptTokens: number; completionTokens: number; estCostUsd: number }> {
  const model = assertModelAllowed(input.model);
  const estCostUsd = estimateCost(model, input.promptTokens, input.completionTokens);
  await store.recordUsage({ ...input, estCostUsd });
  return { promptTokens: input.promptTokens, completionTokens: input.completionTokens, estCostUsd };
}
