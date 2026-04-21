import { createAIDashboardService, type AIDashboardService } from './ai-dashboard-service'

const dayMs = 24 * 60 * 60 * 1000
const now = Date.now()

const usageRecords = [
  {
    userId: 'dev-admin',
    domain: 'feedback',
    provider: 'claude' as const,
    promptTokens: 2200,
    completionTokens: 1400,
    estimatedCostUsd: 2.34,
    latencyMs: 920,
    cacheHit: false,
    createdAt: new Date(now - 28 * dayMs),
  },
  {
    userId: 'dev-admin',
    domain: 'feedback',
    provider: 'openai' as const,
    promptTokens: 1800,
    completionTokens: 1200,
    estimatedCostUsd: 1.72,
    latencyMs: 710,
    cacheHit: true,
    createdAt: new Date(now - 20 * dayMs),
  },
  {
    userId: 'hr-manager-1',
    domain: 'evaluation',
    provider: 'claude' as const,
    promptTokens: 3400,
    completionTokens: 2100,
    estimatedCostUsd: 3.88,
    latencyMs: 1100,
    cacheHit: false,
    createdAt: new Date(now - 14 * dayMs),
  },
  {
    userId: 'manager-1',
    domain: 'goals',
    provider: 'openai' as const,
    promptTokens: 1200,
    completionTokens: 700,
    estimatedCostUsd: 0.96,
    latencyMs: 640,
    cacheHit: true,
    createdAt: new Date(now - 7 * dayMs),
  },
  {
    userId: 'manager-2',
    domain: 'organization',
    provider: 'claude' as const,
    promptTokens: 2600,
    completionTokens: 1550,
    estimatedCostUsd: 2.91,
    latencyMs: 980,
    cacheHit: false,
    createdAt: new Date(now - 2 * dayMs),
  },
]

const failureRecords = [
  {
    userId: 'manager-1',
    errorCategory: 'TIMEOUT',
    createdAt: new Date(now - 10 * dayMs),
  },
  {
    userId: 'manager-2',
    errorCategory: 'RATE_LIMIT',
    createdAt: new Date(now - 5 * dayMs),
  },
]

const devService = createAIDashboardService({
  usageQuery: {
    async listByDateRange(range) {
      return usageRecords.filter(
        (record) => record.createdAt >= range.from && record.createdAt <= range.to,
      )
    },
    async listFailuresByDateRange(range) {
      return failureRecords.filter(
        (record) => record.createdAt >= range.from && record.createdAt <= range.to,
      )
    },
  },
})

export function getDevAIDashboardService(): AIDashboardService {
  return devService
}
