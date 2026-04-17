import { describe, it, expect } from 'vitest'
import { createInMemoryAIBudgetRepository } from '@/lib/ai-monitoring/ai-budget-repository'
import type { AIBudgetConfig } from '@/lib/ai-monitoring/ai-budget-types'

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

describe('createInMemoryAIBudgetRepository', () => {
  it('returns null for unknown yearMonth', async () => {
    const repo = createInMemoryAIBudgetRepository()
    expect(await repo.get('2026-04')).toBeNull()
  })

  it('seeds initial configs', async () => {
    const repo = createInMemoryAIBudgetRepository([makeConfig({ yearMonth: '2026-04' })])
    const fetched = await repo.get('2026-04')
    expect(fetched).not.toBeNull()
    expect(fetched?.budgetUsd).toBe(100)
  })

  it('upsert inserts when absent', async () => {
    const repo = createInMemoryAIBudgetRepository()
    const saved = await repo.upsert(makeConfig({ yearMonth: '2026-04', budgetUsd: 250 }))
    expect(saved.budgetUsd).toBe(250)
    const fetched = await repo.get('2026-04')
    expect(fetched?.budgetUsd).toBe(250)
  })

  it('upsert overwrites when present', async () => {
    const repo = createInMemoryAIBudgetRepository([makeConfig({ budgetUsd: 100 })])
    await repo.upsert(makeConfig({ budgetUsd: 500 }))
    const fetched = await repo.get('2026-04')
    expect(fetched?.budgetUsd).toBe(500)
  })

  it('setNonCriticalDisabled updates flag for existing config', async () => {
    const repo = createInMemoryAIBudgetRepository([makeConfig()])
    await repo.setNonCriticalDisabled('2026-04', true)
    const fetched = await repo.get('2026-04')
    expect(fetched?.nonCriticalDisabled).toBe(true)

    await repo.setNonCriticalDisabled('2026-04', false)
    const fetched2 = await repo.get('2026-04')
    expect(fetched2?.nonCriticalDisabled).toBe(false)
  })

  it('setNonCriticalDisabled is a no-op when config is absent', async () => {
    const repo = createInMemoryAIBudgetRepository()
    await repo.setNonCriticalDisabled('2026-04', true)
    expect(await repo.get('2026-04')).toBeNull()
  })

  it('rejects invalid yearMonth via schema', async () => {
    const repo = createInMemoryAIBudgetRepository()
    await expect(repo.get('2026-13' as unknown as '2026-04')).rejects.toThrow()
  })

  it('rejects invalid seed config via schema', () => {
    expect(() => createInMemoryAIBudgetRepository([{ ...makeConfig(), budgetUsd: -1 }])).toThrow()
  })
})
