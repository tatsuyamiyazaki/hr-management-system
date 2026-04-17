import { describe, it, expect } from 'vitest'
import {
  ALERT_LEVELS,
  NON_CRITICAL_FEATURES,
  aiBudgetConfigSchema,
  isAlertLevel,
  isNonCriticalFeature,
  isYearMonth,
  yearMonthSchema,
} from '@/lib/ai-monitoring/ai-budget-types'

describe('yearMonthSchema', () => {
  it('accepts YYYY-MM format', () => {
    expect(yearMonthSchema.parse('2026-04')).toBe('2026-04')
    expect(yearMonthSchema.parse('1999-12')).toBe('1999-12')
    expect(yearMonthSchema.parse('2026-01')).toBe('2026-01')
  })

  it('rejects invalid formats', () => {
    expect(() => yearMonthSchema.parse('2026-13')).toThrow()
    expect(() => yearMonthSchema.parse('2026-00')).toThrow()
    expect(() => yearMonthSchema.parse('26-04')).toThrow()
    expect(() => yearMonthSchema.parse('2026/04')).toThrow()
    expect(() => yearMonthSchema.parse('2026-4')).toThrow()
    expect(() => yearMonthSchema.parse('')).toThrow()
  })

  it('isYearMonth narrows unknown input', () => {
    expect(isYearMonth('2026-04')).toBe(true)
    expect(isYearMonth('not-a-month')).toBe(false)
    expect(isYearMonth(202604)).toBe(false)
    expect(isYearMonth(null)).toBe(false)
  })
})

describe('aiBudgetConfigSchema', () => {
  it('accepts a valid config and applies defaults', () => {
    const parsed = aiBudgetConfigSchema.parse({
      yearMonth: '2026-04',
      budgetUsd: 100,
    })
    expect(parsed.budgetUsd).toBe(100)
    expect(parsed.warnThresholdPct).toBe(80)
    expect(parsed.criticalThresholdPct).toBe(100)
    expect(parsed.nonCriticalDisabled).toBe(false)
  })

  it('accepts custom thresholds', () => {
    const parsed = aiBudgetConfigSchema.parse({
      yearMonth: '2026-04',
      budgetUsd: 50.5,
      warnThresholdPct: 70,
      criticalThresholdPct: 90,
      nonCriticalDisabled: true,
    })
    expect(parsed.warnThresholdPct).toBe(70)
    expect(parsed.criticalThresholdPct).toBe(90)
    expect(parsed.nonCriticalDisabled).toBe(true)
  })

  it('rejects non-positive budgetUsd', () => {
    expect(() => aiBudgetConfigSchema.parse({ yearMonth: '2026-04', budgetUsd: 0 })).toThrow()
    expect(() => aiBudgetConfigSchema.parse({ yearMonth: '2026-04', budgetUsd: -1 })).toThrow()
  })

  it('rejects threshold out of range', () => {
    expect(() =>
      aiBudgetConfigSchema.parse({
        yearMonth: '2026-04',
        budgetUsd: 100,
        warnThresholdPct: 0,
      }),
    ).toThrow()
    expect(() =>
      aiBudgetConfigSchema.parse({
        yearMonth: '2026-04',
        budgetUsd: 100,
        warnThresholdPct: 101,
      }),
    ).toThrow()
    expect(() =>
      aiBudgetConfigSchema.parse({
        yearMonth: '2026-04',
        budgetUsd: 100,
        criticalThresholdPct: 201,
      }),
    ).toThrow()
  })

  it('rejects invalid yearMonth', () => {
    expect(() => aiBudgetConfigSchema.parse({ yearMonth: '2026-13', budgetUsd: 100 })).toThrow()
  })
})

describe('AlertLevel constants', () => {
  it('contains NONE / WARN / CRITICAL', () => {
    expect(ALERT_LEVELS).toEqual(['NONE', 'WARN', 'CRITICAL'])
  })

  it('isAlertLevel narrows unknown input', () => {
    expect(isAlertLevel('NONE')).toBe(true)
    expect(isAlertLevel('WARN')).toBe(true)
    expect(isAlertLevel('CRITICAL')).toBe(true)
    expect(isAlertLevel('INFO')).toBe(false)
    expect(isAlertLevel(undefined)).toBe(false)
  })
})

describe('NON_CRITICAL_FEATURES constants', () => {
  it('contains FEEDBACK_SUMMARY and FEEDBACK_TRANSFORM', () => {
    expect(NON_CRITICAL_FEATURES).toContain('FEEDBACK_SUMMARY')
    expect(NON_CRITICAL_FEATURES).toContain('FEEDBACK_TRANSFORM')
  })

  it('isNonCriticalFeature narrows unknown input', () => {
    expect(isNonCriticalFeature('FEEDBACK_SUMMARY')).toBe(true)
    expect(isNonCriticalFeature('UNKNOWN_FEATURE')).toBe(false)
    expect(isNonCriticalFeature(42)).toBe(false)
  })
})
