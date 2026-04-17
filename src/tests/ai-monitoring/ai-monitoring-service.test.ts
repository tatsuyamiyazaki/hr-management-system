import { describe, it, expect } from 'vitest'
import { createAIMonitoringService } from '@/lib/ai-monitoring/ai-monitoring-service'
import { createInMemoryAIUsageRepository } from '@/lib/ai-monitoring/ai-usage-repository'
import {
  InvalidYearMonthError,
  type AIUsageEntry,
  type AIUsageFailure,
} from '@/lib/ai-monitoring/ai-usage-types'

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AIUsageEntry> = {}): AIUsageEntry {
  return {
    userId: overrides.userId ?? 'user-1',
    domain: overrides.domain ?? 'ai-coach',
    provider: overrides.provider ?? 'claude',
    promptTokens: overrides.promptTokens ?? 100,
    completionTokens: overrides.completionTokens ?? 50,
    estimatedCostUsd: overrides.estimatedCostUsd ?? 0.001,
    latencyMs: overrides.latencyMs ?? 200,
    cacheHit: overrides.cacheHit ?? false,
    requestId: overrides.requestId ?? 'req-1',
    createdAt: overrides.createdAt ?? new Date('2026-04-17T10:00:00Z'),
  }
}

function makeFailure(overrides: Partial<AIUsageFailure> = {}): AIUsageFailure {
  return {
    userId: overrides.userId ?? 'user-1',
    domain: overrides.domain ?? 'ai-coach',
    provider: overrides.provider ?? 'claude',
    attemptCount: overrides.attemptCount ?? 1,
    errorCategory: overrides.errorCategory ?? 'TIMEOUT',
    latencyMs: overrides.latencyMs ?? 5000,
    requestId: overrides.requestId ?? 'fail-1',
    createdAt: overrides.createdAt ?? new Date('2026-04-17T10:00:00Z'),
  }
}

const APRIL_2026 = '2026-04'
const APRIL_2026_RANGE = {
  from: new Date('2026-04-01T00:00:00Z'),
  to: new Date('2026-05-01T00:00:00Z'),
}

const FIXED_NOW = new Date('2026-04-17T12:00:00Z')
const fixedClock = () => FIXED_NOW

// ─────────────────────────────────────────────────────────────────────────────
// recordUsage / recordFailure
// ─────────────────────────────────────────────────────────────────────────────

describe('AIMonitoringService.recordUsage()', () => {
  it('validates and persists a valid entry', async () => {
    const repo = createInMemoryAIUsageRepository()
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })
    await service.recordUsage(makeEntry({ requestId: 'record-1' }))

    const stored = await repo.listByDateRange(APRIL_2026_RANGE)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.requestId).toBe('record-1')
  })

  it('rejects invalid entries via Zod (negative tokens)', async () => {
    const repo = createInMemoryAIUsageRepository()
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })
    await expect(service.recordUsage(makeEntry({ promptTokens: -1 }))).rejects.toThrow()
  })
})

describe('AIMonitoringService.recordFailure()', () => {
  it('validates and persists a valid failure', async () => {
    const repo = createInMemoryAIUsageRepository()
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })
    await service.recordFailure(makeFailure({ requestId: 'fail-a' }))

    const stored = await repo.listFailuresByDateRange(APRIL_2026_RANGE)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.requestId).toBe('fail-a')
  })

  it('rejects invalid failures via Zod (attemptCount=0)', async () => {
    const repo = createInMemoryAIUsageRepository()
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })
    await expect(service.recordFailure(makeFailure({ attemptCount: 0 }))).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getMonthlyCost
// ─────────────────────────────────────────────────────────────────────────────

describe('AIMonitoringService.getMonthlyCost()', () => {
  it('aggregates total/byProvider/byDomain/byDay correctly', async () => {
    const repo = createInMemoryAIUsageRepository({
      entries: [
        makeEntry({
          provider: 'claude',
          domain: 'ai-coach',
          estimatedCostUsd: 0.5,
          createdAt: new Date('2026-04-01T09:00:00Z'),
        }),
        makeEntry({
          provider: 'claude',
          domain: 'feedback',
          estimatedCostUsd: 0.2,
          createdAt: new Date('2026-04-01T10:00:00Z'),
        }),
        makeEntry({
          provider: 'openai',
          domain: 'ai-coach',
          estimatedCostUsd: 0.3,
          createdAt: new Date('2026-04-15T00:00:00Z'),
        }),
        // out of month
        makeEntry({
          provider: 'claude',
          estimatedCostUsd: 100,
          createdAt: new Date('2026-05-01T00:00:00Z'),
        }),
      ],
    })
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })
    const summary = await service.getMonthlyCost(APRIL_2026)

    expect(summary.yearMonth).toBe(APRIL_2026)
    expect(summary.totalRequests).toBe(3)
    expect(summary.totalCostUsd).toBeCloseTo(1.0, 10)
    expect(summary.byProvider).toEqual({ claude: 0.7, openai: 0.3 })
    expect(summary.byDomain).toEqual({ 'ai-coach': 0.8, feedback: 0.2 })
    expect(summary.byDay).toEqual([
      { date: '2026-04-01', costUsd: 0.7, requests: 2 },
      { date: '2026-04-15', costUsd: 0.3, requests: 1 },
    ])
  })

  it('returns zeros when no entries exist', async () => {
    const service = createAIMonitoringService({
      repository: createInMemoryAIUsageRepository(),
      clock: fixedClock,
    })
    const summary = await service.getMonthlyCost(APRIL_2026)
    expect(summary.totalCostUsd).toBe(0)
    expect(summary.totalRequests).toBe(0)
    expect(summary.byDay).toEqual([])
  })

  it('throws InvalidYearMonthError for malformed yearMonth', async () => {
    const service = createAIMonitoringService({
      repository: createInMemoryAIUsageRepository(),
      clock: fixedClock,
    })
    await expect(service.getMonthlyCost('2026/04')).rejects.toBeInstanceOf(InvalidYearMonthError)
    await expect(service.getMonthlyCost('2026-13')).rejects.toBeInstanceOf(InvalidYearMonthError)
    await expect(service.getMonthlyCost('2026-00')).rejects.toBeInstanceOf(InvalidYearMonthError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getUserUsage
// ─────────────────────────────────────────────────────────────────────────────

describe('AIMonitoringService.getUserUsage()', () => {
  it('aggregates cost, tokens, and cacheHitRate for the user', async () => {
    const repo = createInMemoryAIUsageRepository({
      entries: [
        makeEntry({
          userId: 'user-1',
          promptTokens: 100,
          completionTokens: 50,
          estimatedCostUsd: 0.1,
          cacheHit: true,
        }),
        makeEntry({
          userId: 'user-1',
          promptTokens: 200,
          completionTokens: 80,
          estimatedCostUsd: 0.2,
          cacheHit: false,
        }),
        // other user
        makeEntry({ userId: 'user-2', estimatedCostUsd: 9 }),
      ],
    })
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })
    const summary = await service.getUserUsage('user-1', APRIL_2026_RANGE)

    expect(summary.userId).toBe('user-1')
    expect(summary.totalRequests).toBe(2)
    expect(summary.totalPromptTokens).toBe(300)
    expect(summary.totalCompletionTokens).toBe(130)
    expect(summary.totalCostUsd).toBeCloseTo(0.3, 10)
    expect(summary.cacheHitRate).toBeCloseTo(0.5, 10)
  })

  it('returns cacheHitRate=0 when user has no entries', async () => {
    const service = createAIMonitoringService({
      repository: createInMemoryAIUsageRepository(),
      clock: fixedClock,
    })
    const summary = await service.getUserUsage('ghost', APRIL_2026_RANGE)
    expect(summary.totalRequests).toBe(0)
    expect(summary.cacheHitRate).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getFailureRate
// ─────────────────────────────────────────────────────────────────────────────

describe('AIMonitoringService.getFailureRate()', () => {
  it('computes failures / (failures + successes)', async () => {
    const repo = createInMemoryAIUsageRepository({
      entries: [
        makeEntry({ requestId: 's1' }),
        makeEntry({ requestId: 's2' }),
        makeEntry({ requestId: 's3' }),
      ],
      failures: [
        makeFailure({ errorCategory: 'TIMEOUT', requestId: 'f1' }),
        makeFailure({ errorCategory: 'PROVIDER_ERROR', requestId: 'f2' }),
      ],
    })
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })
    const summary = await service.getFailureRate(APRIL_2026_RANGE)

    expect(summary.totalAttempts).toBe(5)
    expect(summary.failureCount).toBe(2)
    expect(summary.failureRate).toBeCloseTo(0.4, 10)
    expect(summary.byErrorCategory).toEqual({ TIMEOUT: 1, PROVIDER_ERROR: 1 })
  })

  it('returns zero rate when no attempts', async () => {
    const service = createAIMonitoringService({
      repository: createInMemoryAIUsageRepository(),
      clock: fixedClock,
    })
    const summary = await service.getFailureRate(APRIL_2026_RANGE)
    expect(summary.totalAttempts).toBe(0)
    expect(summary.failureRate).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// detectAnomaly (Req 19.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('AIMonitoringService.detectAnomaly()', () => {
  it('flags users whose current cost exceeds 5x the last-3-months average', async () => {
    const baselineDates = [
      new Date('2026-01-15T00:00:00Z'),
      new Date('2026-02-15T00:00:00Z'),
      new Date('2026-03-15T00:00:00Z'),
    ]
    const repo = createInMemoryAIUsageRepository({
      entries: [
        // baseline: user-heavy に 3 ヶ月それぞれ 1 USD (平均 1 USD)
        ...baselineDates.map((d) =>
          makeEntry({ userId: 'user-heavy', estimatedCostUsd: 1, createdAt: d }),
        ),
        // 対象月: user-heavy は 10 USD → 10x で検出
        makeEntry({
          userId: 'user-heavy',
          estimatedCostUsd: 10,
          createdAt: new Date('2026-04-05T00:00:00Z'),
        }),
        // 普通ユーザー: 2 USD → 2x なので検出されない (非anomaly)
        ...baselineDates.map((d) =>
          makeEntry({ userId: 'user-normal', estimatedCostUsd: 1, createdAt: d }),
        ),
        makeEntry({
          userId: 'user-normal',
          estimatedCostUsd: 2,
          createdAt: new Date('2026-04-05T00:00:00Z'),
        }),
      ],
    })
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })

    const flags = await service.detectAnomaly(APRIL_2026)
    expect(flags).toHaveLength(1)
    const flag = flags[0]!
    expect(flag.userId).toBe('user-heavy')
    expect(flag.yearMonth).toBe(APRIL_2026)
    expect(flag.currentCostUsd).toBeCloseTo(10, 10)
    expect(flag.baselineCostUsd).toBeCloseTo(1, 10)
    expect(flag.multiplier).toBeCloseTo(10, 10)
    expect(flag.detectedAt.getTime()).toBe(FIXED_NOW.getTime())
  })

  it('skips users whose baseline average is zero (no prior usage)', async () => {
    const repo = createInMemoryAIUsageRepository({
      entries: [
        // baseline なし、当月いきなり高額
        makeEntry({
          userId: 'new-user',
          estimatedCostUsd: 100,
          createdAt: new Date('2026-04-05T00:00:00Z'),
        }),
      ],
    })
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })

    const flags = await service.detectAnomaly(APRIL_2026)
    expect(flags).toHaveLength(0)
  })

  it('skips users whose current cost is below the noise threshold', async () => {
    const baselineDates = [
      new Date('2026-01-15T00:00:00Z'),
      new Date('2026-02-15T00:00:00Z'),
      new Date('2026-03-15T00:00:00Z'),
    ]
    const repo = createInMemoryAIUsageRepository({
      entries: [
        // baseline 極小 (合計 0.03 USD → 平均 0.01 USD)
        ...baselineDates.map((d) =>
          makeEntry({ userId: 'tiny-user', estimatedCostUsd: 0.01, createdAt: d }),
        ),
        // 当月 0.5 USD → 50x ではあるがノイズ閾値未満 (1 USD 未満) で除外
        makeEntry({
          userId: 'tiny-user',
          estimatedCostUsd: 0.5,
          createdAt: new Date('2026-04-05T00:00:00Z'),
        }),
      ],
    })
    const service = createAIMonitoringService({ repository: repo, clock: fixedClock })

    const flags = await service.detectAnomaly(APRIL_2026)
    expect(flags).toHaveLength(0)
  })

  it('throws InvalidYearMonthError for malformed yearMonth', async () => {
    const service = createAIMonitoringService({
      repository: createInMemoryAIUsageRepository(),
      clock: fixedClock,
    })
    await expect(service.detectAnomaly('not-a-date')).rejects.toBeInstanceOf(InvalidYearMonthError)
  })

  it('uses the default clock when not provided', async () => {
    // clock を省略しても例外なく動作することを確認
    const service = createAIMonitoringService({
      repository: createInMemoryAIUsageRepository(),
    })
    const flags = await service.detectAnomaly(APRIL_2026)
    expect(flags).toEqual([])
  })
})
