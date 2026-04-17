import { describe, it, expect } from 'vitest'
import { createInMemoryAIUsageRepository } from '@/lib/ai-monitoring/ai-usage-repository'
import type { AIUsageEntry, AIUsageFailure, DateRange } from '@/lib/ai-monitoring/ai-usage-types'

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
    requestId: overrides.requestId ?? 'fail-req',
    createdAt: overrides.createdAt ?? new Date('2026-04-17T10:00:00Z'),
  }
}

const APRIL_2026: DateRange = {
  from: new Date('2026-04-01T00:00:00Z'),
  to: new Date('2026-05-01T00:00:00Z'),
}

// ─────────────────────────────────────────────────────────────────────────────
// create / listByDateRange
// ─────────────────────────────────────────────────────────────────────────────

describe('InMemoryAIUsageRepository', () => {
  describe('create()', () => {
    it('persists an entry that is returned by listByDateRange', async () => {
      const repo = createInMemoryAIUsageRepository()
      await repo.create(makeEntry({ requestId: 'new-1' }))
      const result = await repo.listByDateRange(APRIL_2026)
      expect(result).toHaveLength(1)
      expect(result[0]?.requestId).toBe('new-1')
    })

    it('defensively clones input so outside mutation does not leak', async () => {
      const repo = createInMemoryAIUsageRepository()
      const entry = makeEntry({ promptTokens: 10 })
      await repo.create(entry)
      // 外部で変更しても保存済みデータに影響しない
      ;(entry as { promptTokens: number }).promptTokens = 999
      const result = await repo.listByDateRange(APRIL_2026)
      expect(result[0]?.promptTokens).toBe(10)
    })
  })

  describe('createFailure()', () => {
    it('persists a failure', async () => {
      const repo = createInMemoryAIUsageRepository()
      await repo.createFailure(makeFailure({ requestId: 'fail-new' }))
      const result = await repo.listFailuresByDateRange(APRIL_2026)
      expect(result).toHaveLength(1)
      expect(result[0]?.requestId).toBe('fail-new')
    })
  })

  describe('seed behavior', () => {
    it('defensively clones seed entries and failures', async () => {
      const seedEntry = makeEntry({ promptTokens: 5 })
      const seedFailure = makeFailure({ attemptCount: 2 })
      const repo = createInMemoryAIUsageRepository({
        entries: [seedEntry],
        failures: [seedFailure],
      })
      ;(seedEntry as { promptTokens: number }).promptTokens = 9999
      ;(seedFailure as { attemptCount: number }).attemptCount = 9999

      const entries = await repo.listByDateRange(APRIL_2026)
      const failures = await repo.listFailuresByDateRange(APRIL_2026)
      expect(entries[0]?.promptTokens).toBe(5)
      expect(failures[0]?.attemptCount).toBe(2)
    })
  })

  describe('listByDateRange()', () => {
    it('filters entries within [from, to) and sorts by createdAt asc', async () => {
      const repo = createInMemoryAIUsageRepository({
        entries: [
          makeEntry({ requestId: 'march', createdAt: new Date('2026-03-31T23:59:59Z') }),
          makeEntry({ requestId: 'mid', createdAt: new Date('2026-04-15T00:00:00Z') }),
          makeEntry({ requestId: 'first', createdAt: new Date('2026-04-01T00:00:00Z') }),
          makeEntry({ requestId: 'may', createdAt: new Date('2026-05-01T00:00:00Z') }),
        ],
      })
      const result = await repo.listByDateRange(APRIL_2026)
      expect(result.map((e) => e.requestId)).toEqual(['first', 'mid'])
    })

    it('returns empty when nothing matches', async () => {
      const repo = createInMemoryAIUsageRepository({
        entries: [makeEntry({ createdAt: new Date('2026-01-01T00:00:00Z') })],
      })
      const result = await repo.listByDateRange(APRIL_2026)
      expect(result).toEqual([])
    })
  })

  describe('listByUser()', () => {
    it('returns only the specified user entries within range', async () => {
      const repo = createInMemoryAIUsageRepository({
        entries: [
          makeEntry({ userId: 'user-1', requestId: 'a' }),
          makeEntry({ userId: 'user-2', requestId: 'b' }),
          makeEntry({ userId: 'user-1', requestId: 'c' }),
        ],
      })
      const result = await repo.listByUser('user-1', APRIL_2026)
      expect(result.map((e) => e.requestId)).toEqual(['a', 'c'])
    })
  })

  describe('listFailuresByDateRange()', () => {
    it('filters and sorts failures', async () => {
      const repo = createInMemoryAIUsageRepository({
        failures: [
          makeFailure({ requestId: 'f2', createdAt: new Date('2026-04-15T10:00:00Z') }),
          makeFailure({ requestId: 'f1', createdAt: new Date('2026-04-01T00:00:00Z') }),
          makeFailure({ requestId: 'fout', createdAt: new Date('2026-03-01T00:00:00Z') }),
        ],
      })
      const result = await repo.listFailuresByDateRange(APRIL_2026)
      expect(result.map((f) => f.requestId)).toEqual(['f1', 'f2'])
    })
  })
})
