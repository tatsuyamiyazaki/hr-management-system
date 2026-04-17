import { describe, it, expect, vi } from 'vitest'
import type { AIAlertNotifier } from '@/lib/ai-monitoring/ai-alert-notifier'
import { createInMemoryAIBudgetRepository } from '@/lib/ai-monitoring/ai-budget-repository'
import {
  AIBudgetNotConfiguredError,
  createAIBudgetService,
  type BudgetAuditLogPort,
  type BudgetCostQueryPort,
} from '@/lib/ai-monitoring/ai-budget-service'
import type { AIBudgetConfig } from '@/lib/ai-monitoring/ai-budget-types'
import { createInMemoryFeatureFlagStore } from '@/lib/ai-monitoring/feature-flag-store'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AIBudgetConfig> = {}): AIBudgetConfig {
  return {
    yearMonth: '2026-04',
    budgetUsd: 100,
    warnThresholdPct: 80,
    criticalThresholdPct: 100,
    nonCriticalDisabled: false,
    ...overrides,
  }
}

function makeNotifierMock(): AIAlertNotifier & { notify: ReturnType<typeof vi.fn> } {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
  }
}

function makeAuditMock(): BudgetAuditLogPort & { emit: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn().mockResolvedValue(undefined),
  }
}

function makeCostQuery(cost: number): BudgetCostQueryPort {
  return { getMonthlyCostUsd: vi.fn().mockResolvedValue(cost) }
}

// ─────────────────────────────────────────────────────────────────────────────
// evaluate()
// ─────────────────────────────────────────────────────────────────────────────

describe('AIBudgetService.evaluate', () => {
  it('returns NONE when utilization is below WARN threshold', async () => {
    const service = createAIBudgetService({
      costQuery: makeCostQuery(50),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })
    const result = await service.evaluate('2026-04')
    expect(result.level).toBe('NONE')
    expect(result.utilizationPct).toBe(50)
    expect(result.currentCostUsd).toBe(50)
    expect(result.budgetUsd).toBe(100)
  })

  it('returns WARN when utilization meets warn threshold but below critical', async () => {
    const service = createAIBudgetService({
      costQuery: makeCostQuery(80),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })
    const result = await service.evaluate('2026-04')
    expect(result.level).toBe('WARN')
    expect(result.utilizationPct).toBe(80)
  })

  it('returns WARN when utilization is between warn and critical', async () => {
    const service = createAIBudgetService({
      costQuery: makeCostQuery(95),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })
    const result = await service.evaluate('2026-04')
    expect(result.level).toBe('WARN')
  })

  it('returns CRITICAL exactly at 100% (boundary)', async () => {
    const service = createAIBudgetService({
      costQuery: makeCostQuery(100),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })
    const result = await service.evaluate('2026-04')
    expect(result.level).toBe('CRITICAL')
    expect(result.utilizationPct).toBe(100)
  })

  it('returns CRITICAL when utilization exceeds 100%', async () => {
    const service = createAIBudgetService({
      costQuery: makeCostQuery(120),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })
    const result = await service.evaluate('2026-04')
    expect(result.level).toBe('CRITICAL')
    expect(result.utilizationPct).toBe(120)
  })

  it('throws AIBudgetNotConfiguredError when budget is absent', async () => {
    const service = createAIBudgetService({
      costQuery: makeCostQuery(50),
      budgetRepo: createInMemoryAIBudgetRepository(),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })
    await expect(service.evaluate('2026-04')).rejects.toBeInstanceOf(AIBudgetNotConfiguredError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkAndAlert()
// ─────────────────────────────────────────────────────────────────────────────

describe('AIBudgetService.checkAndAlert', () => {
  it('does NOT notify or disable features when level is NONE', async () => {
    const notifier = makeNotifierMock()
    const flagStore = createInMemoryFeatureFlagStore()
    const service = createAIBudgetService({
      costQuery: makeCostQuery(50),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore,
      notifier,
    })

    const result = await service.checkAndAlert('2026-04')
    expect(result.level).toBe('NONE')
    expect(notifier.notify).not.toHaveBeenCalled()
    expect(await flagStore.isEnabled('FEEDBACK_SUMMARY')).toBe(true)
    expect(await flagStore.isEnabled('FEEDBACK_TRANSFORM')).toBe(true)
  })

  it('notifies but does NOT disable features on WARN', async () => {
    const notifier = makeNotifierMock()
    const flagStore = createInMemoryFeatureFlagStore()
    const budgetRepo = createInMemoryAIBudgetRepository([makeConfig()])
    const service = createAIBudgetService({
      costQuery: makeCostQuery(80),
      budgetRepo,
      flagStore,
      notifier,
    })

    const result = await service.checkAndAlert('2026-04')
    expect(result.level).toBe('WARN')
    expect(notifier.notify).toHaveBeenCalledTimes(1)
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'WARN', yearMonth: '2026-04' }),
    )
    expect(await flagStore.isEnabled('FEEDBACK_SUMMARY')).toBe(true)
    expect(await flagStore.isEnabled('FEEDBACK_TRANSFORM')).toBe(true)
    const config = await budgetRepo.get('2026-04')
    expect(config?.nonCriticalDisabled).toBe(false)
  })

  it('notifies AND disables all NON_CRITICAL_FEATURES on CRITICAL', async () => {
    const notifier = makeNotifierMock()
    const flagStore = createInMemoryFeatureFlagStore()
    const budgetRepo = createInMemoryAIBudgetRepository([makeConfig()])
    const service = createAIBudgetService({
      costQuery: makeCostQuery(100),
      budgetRepo,
      flagStore,
      notifier,
    })

    const result = await service.checkAndAlert('2026-04')
    expect(result.level).toBe('CRITICAL')
    expect(notifier.notify).toHaveBeenCalledTimes(1)
    expect(await flagStore.isEnabled('FEEDBACK_SUMMARY')).toBe(false)
    expect(await flagStore.isEnabled('FEEDBACK_TRANSFORM')).toBe(false)
    const config = await budgetRepo.get('2026-04')
    expect(config?.nonCriticalDisabled).toBe(true)
  })

  it('only disables the custom nonCriticalFeatures subset when provided', async () => {
    const notifier = makeNotifierMock()
    const flagStore = createInMemoryFeatureFlagStore()
    const service = createAIBudgetService({
      costQuery: makeCostQuery(100),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore,
      notifier,
      nonCriticalFeatures: ['FEEDBACK_SUMMARY'],
    })

    await service.checkAndAlert('2026-04')
    expect(await flagStore.isEnabled('FEEDBACK_SUMMARY')).toBe(false)
    expect(await flagStore.isEnabled('FEEDBACK_TRANSFORM')).toBe(true)
  })

  it('throws AIBudgetNotConfiguredError when budget is absent', async () => {
    const service = createAIBudgetService({
      costQuery: makeCostQuery(50),
      budgetRepo: createInMemoryAIBudgetRepository(),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })
    await expect(service.checkAndAlert('2026-04')).rejects.toBeInstanceOf(
      AIBudgetNotConfiguredError,
    )
  })

  it('is idempotent: notifier receives each (yearMonth, level) only once across repeated calls', async () => {
    // Notifier side is the source of truth for idempotency (per design). We
    // simulate a real notifier that dedupes by (yearMonth, level) pair and
    // assert the service triggers exactly one emission.
    const sentRecord = new Set<string>()
    const emitted: string[] = []
    const notifier: AIAlertNotifier = {
      notify: async (params) => {
        const key = `${params.yearMonth}:${params.level}`
        if (sentRecord.has(key)) return
        sentRecord.add(key)
        emitted.push(key)
      },
    }

    const service = createAIBudgetService({
      costQuery: makeCostQuery(80),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier,
    })

    await service.checkAndAlert('2026-04')
    await service.checkAndAlert('2026-04')
    expect(emitted).toEqual(['2026-04:WARN'])
  })

  it('records an audit entry with AI_BUDGET_THRESHOLD_REACHED on CRITICAL', async () => {
    const audit = makeAuditMock()
    const service = createAIBudgetService({
      costQuery: makeCostQuery(100),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
      auditLogger: audit,
    })

    await service.checkAndAlert('2026-04')
    expect(audit.emit).toHaveBeenCalledTimes(1)
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_BUDGET_THRESHOLD_REACHED',
        resourceType: 'SYSTEM_CONFIG',
        resourceId: '2026-04',
        after: expect.objectContaining({
          level: 'CRITICAL',
          utilizationPct: 100,
          currentCostUsd: 100,
          budgetUsd: 100,
        }),
      }),
    )
  })

  it('does not record audit when level is NONE', async () => {
    const audit = makeAuditMock()
    const service = createAIBudgetService({
      costQuery: makeCostQuery(10),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
      auditLogger: audit,
    })

    await service.checkAndAlert('2026-04')
    expect(audit.emit).not.toHaveBeenCalled()
  })

  it('uses injected clock when recording audit (smoke test)', async () => {
    const fixedDate = new Date('2026-04-15T09:00:00Z')
    const clock = vi.fn(() => fixedDate)
    const audit = makeAuditMock()
    const service = createAIBudgetService({
      costQuery: makeCostQuery(100),
      budgetRepo: createInMemoryAIBudgetRepository([makeConfig()]),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
      auditLogger: audit,
      clock,
    })

    await service.checkAndAlert('2026-04')
    expect(clock).toHaveBeenCalled()
    expect(audit.emit).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// upsertBudget()
// ─────────────────────────────────────────────────────────────────────────────

describe('AIBudgetService.upsertBudget', () => {
  it('persists the config and returns the parsed value', async () => {
    const budgetRepo = createInMemoryAIBudgetRepository()
    const service = createAIBudgetService({
      costQuery: makeCostQuery(0),
      budgetRepo,
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })

    const saved = await service.upsertBudget(makeConfig({ budgetUsd: 300 }))
    expect(saved.budgetUsd).toBe(300)
    const fetched = await budgetRepo.get('2026-04')
    expect(fetched?.budgetUsd).toBe(300)
  })

  it('rejects invalid config via schema', async () => {
    const service = createAIBudgetService({
      costQuery: makeCostQuery(0),
      budgetRepo: createInMemoryAIBudgetRepository(),
      flagStore: createInMemoryFeatureFlagStore(),
      notifier: makeNotifierMock(),
    })

    await expect(service.upsertBudget({ ...makeConfig(), budgetUsd: -1 })).rejects.toThrow()
  })
})
