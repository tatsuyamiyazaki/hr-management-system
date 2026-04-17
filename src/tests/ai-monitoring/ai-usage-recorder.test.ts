import { describe, it, expect, vi } from 'vitest'
import {
  createUsageCallback,
  estimateCostUsd,
  UNKNOWN_USER_ID,
  AI_TOKEN_PRICES_USD,
} from '@/lib/ai-monitoring/ai-usage-recorder'
import type { AIMonitoringService } from '@/lib/ai-monitoring/ai-monitoring-service'
import type { AIUsageEntry } from '@/lib/ai-monitoring/ai-usage-types'

// ─────────────────────────────────────────────────────────────────────────────
// モック
// ─────────────────────────────────────────────────────────────────────────────

interface RecordedCall {
  readonly entry: AIUsageEntry
}

function createMockService(): {
  service: AIMonitoringService
  calls: readonly RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const service: AIMonitoringService = {
    async recordUsage(entry) {
      calls.push({ entry: { ...entry } })
    },
    async recordFailure() {
      // not used in these tests
    },
    async getMonthlyCost() {
      throw new Error('not used')
    },
    async getUserUsage() {
      throw new Error('not used')
    },
    async getFailureRate() {
      throw new Error('not used')
    },
    async detectAnomaly() {
      return []
    },
  }
  return { service, calls }
}

// ─────────────────────────────────────────────────────────────────────────────
// estimateCostUsd
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateCostUsd', () => {
  it('matches claude pricing ($0.80/1M prompt, $4.00/1M completion)', () => {
    // 1M prompt tokens only
    expect(estimateCostUsd('claude', 1_000_000, 0)).toBeCloseTo(0.8, 10)
    // 1M completion tokens only
    expect(estimateCostUsd('claude', 0, 1_000_000)).toBeCloseTo(4.0, 10)
    // mixed
    expect(estimateCostUsd('claude', 500_000, 250_000)).toBeCloseTo(0.4 + 1.0, 10)
  })

  it('matches openai pricing ($0.15/1M prompt, $0.60/1M completion)', () => {
    expect(estimateCostUsd('openai', 1_000_000, 0)).toBeCloseTo(0.15, 10)
    expect(estimateCostUsd('openai', 0, 1_000_000)).toBeCloseTo(0.6, 10)
    expect(estimateCostUsd('openai', 2_000_000, 500_000)).toBeCloseTo(0.3 + 0.3, 10)
  })

  it('returns 0 when both token counts are 0', () => {
    expect(estimateCostUsd('claude', 0, 0)).toBe(0)
    expect(estimateCostUsd('openai', 0, 0)).toBe(0)
  })

  it('exposes immutable price table', () => {
    expect(AI_TOKEN_PRICES_USD.claude.promptPerToken).toBeCloseTo(0.8 / 1_000_000, 15)
    expect(AI_TOKEN_PRICES_USD.openai.completionPerToken).toBeCloseTo(0.6 / 1_000_000, 15)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createUsageCallback
// ─────────────────────────────────────────────────────────────────────────────

describe('createUsageCallback', () => {
  const FIXED_NOW = new Date('2026-04-17T12:00:00Z')

  it('forwards gateway event to recordUsage with computed cost and context metadata', async () => {
    const { service, calls } = createMockService()
    const callback = createUsageCallback(service, {
      userIdResolver: () => 'user-42',
      requestIdFactory: () => 'req-fixed',
      clock: () => FIXED_NOW,
    })

    await callback({
      domain: 'ai-coach',
      provider: 'claude',
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      cached: false,
      latencyMs: 250,
    })

    expect(calls).toHaveLength(1)
    const entry = calls[0]!.entry
    expect(entry.userId).toBe('user-42')
    expect(entry.domain).toBe('ai-coach')
    expect(entry.provider).toBe('claude')
    expect(entry.promptTokens).toBe(1_000_000)
    expect(entry.completionTokens).toBe(500_000)
    // claude: 1M prompt $0.8 + 0.5M completion $2 = $2.8
    expect(entry.estimatedCostUsd).toBeCloseTo(2.8, 10)
    expect(entry.latencyMs).toBe(250)
    expect(entry.cacheHit).toBe(false)
    expect(entry.requestId).toBe('req-fixed')
    expect(entry.createdAt.getTime()).toBe(FIXED_NOW.getTime())
  })

  it("falls back to 'unknown' userId when resolver returns null", async () => {
    const { service, calls } = createMockService()
    const callback = createUsageCallback(service, {
      userIdResolver: () => null,
      requestIdFactory: () => 'req-1',
      clock: () => FIXED_NOW,
    })

    await callback({
      domain: 'feedback',
      provider: 'openai',
      promptTokens: 0,
      completionTokens: 0,
      cached: true,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.entry.userId).toBe(UNKNOWN_USER_ID)
    expect(calls[0]!.entry.cacheHit).toBe(true)
    // latencyMs undefined → 0 に正規化される
    expect(calls[0]!.entry.latencyMs).toBe(0)
    // token 0 → cost 0
    expect(calls[0]!.entry.estimatedCostUsd).toBe(0)
  })

  it("falls back to 'unknown' when resolver returns empty string", async () => {
    const { service, calls } = createMockService()
    const callback = createUsageCallback(service, {
      userIdResolver: () => '',
      requestIdFactory: () => 'req-2',
      clock: () => FIXED_NOW,
    })

    await callback({
      domain: 'ai-coach',
      provider: 'claude',
      promptTokens: 10,
      completionTokens: 5,
      cached: false,
    })

    expect(calls[0]!.entry.userId).toBe(UNKNOWN_USER_ID)
  })

  it('uses default requestIdFactory and clock when not provided', async () => {
    const { service, calls } = createMockService()
    const callback = createUsageCallback(service, {
      userIdResolver: () => 'user-x',
    })

    const before = Date.now()
    await callback({
      domain: 'ai-coach',
      provider: 'openai',
      promptTokens: 10,
      completionTokens: 10,
      cached: false,
    })
    const after = Date.now()

    expect(calls).toHaveLength(1)
    const entry = calls[0]!.entry
    expect(typeof entry.requestId).toBe('string')
    expect(entry.requestId.length).toBeGreaterThan(0)
    expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(entry.createdAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('propagates recordUsage rejection to caller', async () => {
    const service: AIMonitoringService = {
      recordUsage: vi.fn().mockRejectedValue(new Error('boom')),
      recordFailure: vi.fn(),
      getMonthlyCost: vi.fn(),
      getUserUsage: vi.fn(),
      getFailureRate: vi.fn(),
      detectAnomaly: vi.fn(),
    }
    const callback = createUsageCallback(service, {
      userIdResolver: () => 'user-y',
    })

    await expect(
      callback({
        domain: 'ai-coach',
        provider: 'claude',
        promptTokens: 1,
        completionTokens: 1,
        cached: false,
      }),
    ).rejects.toThrow('boom')
  })
})
