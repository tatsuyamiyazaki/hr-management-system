import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  AIDashboardForbiddenError,
  createAIDashboardService,
  type AIDashboardService,
  type DashboardFailureRecord,
  type DashboardUsageQueryPort,
  type DashboardUsageRecord,
} from '@/lib/ai-monitoring/ai-dashboard-service'
import type { DashboardRange } from '@/lib/ai-monitoring/ai-dashboard-types'
import type { UserRole } from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Test doubles
// ─────────────────────────────────────────────────────────────────────────────

interface UsageQuerySpy extends DashboardUsageQueryPort {
  readonly listByDateRange: ReturnType<typeof vi.fn>
  readonly listFailuresByDateRange: ReturnType<typeof vi.fn>
}

function makeUsageQuerySpy(
  usage: readonly DashboardUsageRecord[] = [],
  failures: readonly DashboardFailureRecord[] = [],
): UsageQuerySpy {
  const listByDateRange = vi.fn(async () => usage)
  const listFailuresByDateRange = vi.fn(async () => failures)
  return {
    listByDateRange,
    listFailuresByDateRange,
  } as UsageQuerySpy
}

function makeUsage(overrides: Partial<DashboardUsageRecord> = {}): DashboardUsageRecord {
  return {
    userId: 'u1',
    domain: 'ai-coach',
    provider: 'claude',
    promptTokens: 100,
    completionTokens: 200,
    estimatedCostUsd: 1.0,
    latencyMs: 500,
    cacheHit: false,
    createdAt: new Date('2026-04-05T10:00:00Z'),
    ...overrides,
  }
}

function makeFailure(overrides: Partial<DashboardFailureRecord> = {}): DashboardFailureRecord {
  return {
    userId: 'u1',
    errorCategory: 'TIMEOUT',
    createdAt: new Date('2026-04-05T10:00:00Z'),
    ...overrides,
  }
}

const ADMIN: { userId: string; role: UserRole } = { userId: 'admin-1', role: 'ADMIN' }

const DEFAULT_RANGE: DashboardRange = {
  from: new Date('2026-04-01T00:00:00Z'),
  to: new Date('2026-04-30T23:59:59Z'),
  granularity: 'DAY',
}

function setup(
  usage: readonly DashboardUsageRecord[] = [],
  failures: readonly DashboardFailureRecord[] = [],
): { readonly service: AIDashboardService; readonly usageQuery: UsageQuerySpy } {
  const usageQuery = makeUsageQuerySpy(usage, failures)
  const service = createAIDashboardService({ usageQuery })
  return { service, usageQuery }
}

// ─────────────────────────────────────────────────────────────────────────────
// 認可 (ADMIN のみ許可、他ロールは副作用なしで拒否)
// ─────────────────────────────────────────────────────────────────────────────

describe('AIDashboardService - authorization', () => {
  const nonAdmins: readonly UserRole[] = ['HR_MANAGER', 'MANAGER', 'EMPLOYEE']

  it.each(nonAdmins)(
    'getSnapshot throws AIDashboardForbiddenError for %s without touching usageQuery',
    async (role) => {
      const { service, usageQuery } = setup()
      await expect(
        service.getSnapshot({ requester: { userId: 'x', role }, range: DEFAULT_RANGE }),
      ).rejects.toBeInstanceOf(AIDashboardForbiddenError)
      expect(usageQuery.listByDateRange).not.toHaveBeenCalled()
      expect(usageQuery.listFailuresByDateRange).not.toHaveBeenCalled()
    },
  )

  it.each(nonAdmins)(
    'getProviderComparison throws for %s without touching usageQuery',
    async (role) => {
      const { service, usageQuery } = setup()
      await expect(
        service.getProviderComparison({
          requester: { userId: 'x', role },
          period: { from: DEFAULT_RANGE.from, to: DEFAULT_RANGE.to },
        }),
      ).rejects.toBeInstanceOf(AIDashboardForbiddenError)
      expect(usageQuery.listByDateRange).not.toHaveBeenCalled()
    },
  )

  it.each(nonAdmins)('getFailureRate throws for %s without touching usageQuery', async (role) => {
    const { service, usageQuery } = setup()
    await expect(
      service.getFailureRate({
        requester: { userId: 'x', role },
        period: { from: DEFAULT_RANGE.from, to: DEFAULT_RANGE.to },
      }),
    ).rejects.toBeInstanceOf(AIDashboardForbiddenError)
    expect(usageQuery.listByDateRange).not.toHaveBeenCalled()
    expect(usageQuery.listFailuresByDateRange).not.toHaveBeenCalled()
  })

  it('allows ADMIN to call getSnapshot', async () => {
    const { service, usageQuery } = setup()
    const result = await service.getSnapshot({ requester: ADMIN, range: DEFAULT_RANGE })
    expect(result.range.granularity).toBe('DAY')
    expect(usageQuery.listByDateRange).toHaveBeenCalledTimes(1)
    expect(usageQuery.listFailuresByDateRange).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getSnapshot — バケット化 / topUsers
// ─────────────────────────────────────────────────────────────────────────────

describe('AIDashboardService.getSnapshot - bucketing', () => {
  let baseUsage: readonly DashboardUsageRecord[]

  beforeEach(() => {
    baseUsage = [
      makeUsage({ createdAt: new Date('2026-04-05T10:00:00Z'), estimatedCostUsd: 1 }),
      makeUsage({ createdAt: new Date('2026-04-05T22:00:00Z'), estimatedCostUsd: 2 }),
      makeUsage({ createdAt: new Date('2026-04-06T09:00:00Z'), estimatedCostUsd: 4 }),
      makeUsage({ createdAt: new Date('2026-04-13T09:00:00Z'), estimatedCostUsd: 8 }),
      makeUsage({ createdAt: new Date('2026-05-01T09:00:00Z'), estimatedCostUsd: 16 }),
    ]
  })

  it('DAY granularity groups by YYYY-MM-DD', async () => {
    const { service } = setup(baseUsage)
    const snap = await service.getSnapshot({
      requester: ADMIN,
      range: {
        from: new Date('2026-04-01T00:00:00Z'),
        to: new Date('2026-05-31T00:00:00Z'),
        granularity: 'DAY',
      },
    })
    const buckets = snap.costSeries.points.map((p) => p.bucket)
    expect(buckets).toEqual(['2026-04-05', '2026-04-06', '2026-04-13', '2026-05-01'])
    const day5 = snap.costSeries.points.find((p) => p.bucket === '2026-04-05')
    expect(day5?.costUsd).toBe(3)
    expect(day5?.requests).toBe(2)
  })

  it('WEEK granularity groups by ISO YYYY-Www', async () => {
    const { service } = setup(baseUsage)
    const snap = await service.getSnapshot({
      requester: ADMIN,
      range: {
        from: new Date('2026-04-01T00:00:00Z'),
        to: new Date('2026-05-31T00:00:00Z'),
        granularity: 'WEEK',
      },
    })
    // 2026-04-05 は日曜 => ISO週14 (2026-03-30〜2026-04-05)
    // 2026-04-06 月曜 => ISO週15
    // 2026-04-13 月曜 => ISO週16
    // 2026-05-01 金曜 => ISO週18
    const buckets = snap.costSeries.points.map((p) => p.bucket)
    expect(buckets).toEqual(['2026-W14', '2026-W15', '2026-W16', '2026-W18'])
    buckets.forEach((b) => expect(b).toMatch(/^\d{4}-W\d{2}$/))
  })

  it('MONTH granularity groups by YYYY-MM', async () => {
    const { service } = setup(baseUsage)
    const snap = await service.getSnapshot({
      requester: ADMIN,
      range: {
        from: new Date('2026-04-01T00:00:00Z'),
        to: new Date('2026-05-31T00:00:00Z'),
        granularity: 'MONTH',
      },
    })
    const buckets = snap.costSeries.points.map((p) => p.bucket)
    expect(buckets).toEqual(['2026-04', '2026-05'])
    const april = snap.costSeries.points.find((p) => p.bucket === '2026-04')
    expect(april?.costUsd).toBe(15)
    expect(april?.requests).toBe(4)
    const may = snap.costSeries.points.find((p) => p.bucket === '2026-05')
    expect(may?.costUsd).toBe(16)
  })
})

describe('AIDashboardService.getSnapshot - topUsers', () => {
  it('sorts users by costUsd descending and applies limit', async () => {
    const usage: readonly DashboardUsageRecord[] = [
      makeUsage({ userId: 'u1', estimatedCostUsd: 1 }),
      makeUsage({ userId: 'u2', estimatedCostUsd: 5 }),
      makeUsage({ userId: 'u2', estimatedCostUsd: 5 }),
      makeUsage({ userId: 'u3', estimatedCostUsd: 3 }),
      makeUsage({ userId: 'u4', estimatedCostUsd: 7 }),
      makeUsage({ userId: 'u5', estimatedCostUsd: 0.5 }),
    ]
    const { service } = setup(usage)
    const snap = await service.getSnapshot({
      requester: ADMIN,
      range: DEFAULT_RANGE,
      topUsersLimit: 3,
    })
    expect(snap.topUsers.map((r) => r.userId)).toEqual(['u2', 'u4', 'u3'])
    expect(snap.topUsers[0]).toMatchObject({ userId: 'u2', costUsd: 10, requests: 2 })
  })

  it('defaults topUsersLimit to 10', async () => {
    const usage = Array.from({ length: 15 }, (_, i) =>
      makeUsage({ userId: `u${i + 1}`, estimatedCostUsd: 15 - i }),
    )
    const { service } = setup(usage)
    const snap = await service.getSnapshot({ requester: ADMIN, range: DEFAULT_RANGE })
    expect(snap.topUsers).toHaveLength(10)
    expect(snap.topUsers[0]?.userId).toBe('u1')
  })

  it('rejects non-positive topUsersLimit', async () => {
    const { service } = setup()
    await expect(
      service.getSnapshot({ requester: ADMIN, range: DEFAULT_RANGE, topUsersLimit: 0 }),
    ).rejects.toBeInstanceOf(RangeError)
    await expect(
      service.getSnapshot({ requester: ADMIN, range: DEFAULT_RANGE, topUsersLimit: -1 }),
    ).rejects.toBeInstanceOf(RangeError)
  })

  it('rejects invalid range (from > to) via Zod', async () => {
    const { service, usageQuery } = setup()
    await expect(
      service.getSnapshot({
        requester: ADMIN,
        range: {
          from: new Date('2026-05-01T00:00:00Z'),
          to: new Date('2026-04-01T00:00:00Z'),
          granularity: 'DAY',
        },
      }),
    ).rejects.toThrow()
    expect(usageQuery.listByDateRange).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getProviderComparison
// ─────────────────────────────────────────────────────────────────────────────

describe('AIDashboardService.getProviderComparison', () => {
  it('aggregates requests / cost / avg latency / cache hit rate per provider', async () => {
    const usage: readonly DashboardUsageRecord[] = [
      makeUsage({ provider: 'claude', latencyMs: 100, cacheHit: true, estimatedCostUsd: 1 }),
      makeUsage({ provider: 'claude', latencyMs: 300, cacheHit: false, estimatedCostUsd: 2 }),
      makeUsage({ provider: 'claude', latencyMs: 500, cacheHit: false, estimatedCostUsd: 3 }),
      makeUsage({ provider: 'openai', latencyMs: 200, cacheHit: true, estimatedCostUsd: 4 }),
      makeUsage({ provider: 'openai', latencyMs: 400, cacheHit: true, estimatedCostUsd: 6 }),
    ]
    const { service } = setup(usage)
    const report = await service.getProviderComparison({
      requester: ADMIN,
      period: { from: DEFAULT_RANGE.from, to: DEFAULT_RANGE.to },
    })
    const claude = report.rows.find((r) => r.provider === 'claude')
    const openai = report.rows.find((r) => r.provider === 'openai')

    expect(claude).toEqual({
      provider: 'claude',
      requests: 3,
      costUsd: 6,
      avgLatencyMs: 300,
      cacheHitRate: 1 / 3,
    })
    expect(openai).toEqual({
      provider: 'openai',
      requests: 2,
      costUsd: 10,
      avgLatencyMs: 300,
      cacheHitRate: 1,
    })
  })

  it('returns empty rows when there are no usage records', async () => {
    const { service } = setup([])
    const report = await service.getProviderComparison({
      requester: ADMIN,
      period: { from: DEFAULT_RANGE.from, to: DEFAULT_RANGE.to },
    })
    expect(report.rows).toEqual([])
  })

  it('rejects period where from > to', async () => {
    const { service } = setup()
    await expect(
      service.getProviderComparison({
        requester: ADMIN,
        period: {
          from: new Date('2026-05-01T00:00:00Z'),
          to: new Date('2026-04-01T00:00:00Z'),
        },
      }),
    ).rejects.toBeInstanceOf(RangeError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getFailureRate
// ─────────────────────────────────────────────────────────────────────────────

describe('AIDashboardService.getFailureRate', () => {
  it('computes failures / (failures + successes) with byErrorCategory breakdown', async () => {
    const usage: readonly DashboardUsageRecord[] = [
      makeUsage(),
      makeUsage(),
      makeUsage(),
      makeUsage(),
      makeUsage(),
      makeUsage(),
      makeUsage(),
      makeUsage(), // 8 successes
    ]
    const failures: readonly DashboardFailureRecord[] = [
      makeFailure({ errorCategory: 'TIMEOUT' }),
      makeFailure({ errorCategory: 'TIMEOUT' }),
      makeFailure({ errorCategory: 'PROVIDER_ERROR' }),
      makeFailure({ errorCategory: 'RATE_LIMIT' }),
    ]
    const { service } = setup(usage, failures)
    const snap = await service.getFailureRate({
      requester: ADMIN,
      period: { from: DEFAULT_RANGE.from, to: DEFAULT_RANGE.to },
    })
    expect(snap.totalAttempts).toBe(12)
    expect(snap.failureCount).toBe(4)
    expect(snap.failureRate).toBeCloseTo(4 / 12, 10)
    expect(snap.byErrorCategory).toEqual({
      TIMEOUT: 2,
      PROVIDER_ERROR: 1,
      RATE_LIMIT: 1,
    })
  })

  it('returns failureRate=0 and empty breakdown when there are no records', async () => {
    const { service } = setup([], [])
    const snap = await service.getFailureRate({
      requester: ADMIN,
      period: { from: DEFAULT_RANGE.from, to: DEFAULT_RANGE.to },
    })
    expect(snap).toEqual({
      totalAttempts: 0,
      failureCount: 0,
      failureRate: 0,
      byErrorCategory: {},
    })
  })

  it('returns failureRate=1 when every attempt failed', async () => {
    const failures: readonly DashboardFailureRecord[] = [
      makeFailure({ errorCategory: 'TIMEOUT' }),
      makeFailure({ errorCategory: 'PROVIDER_ERROR' }),
    ]
    const { service } = setup([], failures)
    const snap = await service.getFailureRate({
      requester: ADMIN,
      period: { from: DEFAULT_RANGE.from, to: DEFAULT_RANGE.to },
    })
    expect(snap.totalAttempts).toBe(2)
    expect(snap.failureCount).toBe(2)
    expect(snap.failureRate).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getSnapshot — 統合 (failureRate + providerComparison が 1 スナップショットに同梱)
// ─────────────────────────────────────────────────────────────────────────────

describe('AIDashboardService.getSnapshot - integrated snapshot', () => {
  it('bundles costSeries, topUsers, failureRate and providerComparison', async () => {
    const usage: readonly DashboardUsageRecord[] = [
      makeUsage({
        userId: 'u1',
        provider: 'claude',
        latencyMs: 100,
        cacheHit: true,
        estimatedCostUsd: 2,
      }),
      makeUsage({
        userId: 'u2',
        provider: 'openai',
        latencyMs: 200,
        cacheHit: false,
        estimatedCostUsd: 5,
      }),
    ]
    const failures: readonly DashboardFailureRecord[] = [makeFailure({ errorCategory: 'TIMEOUT' })]
    const { service } = setup(usage, failures)
    const snap = await service.getSnapshot({ requester: ADMIN, range: DEFAULT_RANGE })

    expect(snap.range.granularity).toBe('DAY')
    expect(snap.costSeries.points).toHaveLength(1)
    expect(snap.topUsers.map((r) => r.userId)).toEqual(['u2', 'u1'])
    expect(snap.failureRate.totalAttempts).toBe(3)
    expect(snap.failureRate.failureCount).toBe(1)
    expect(snap.failureRate.byErrorCategory).toEqual({ TIMEOUT: 1 })
    expect(snap.providerComparison.rows).toHaveLength(2)
  })
})
