import { describe, it, expect } from 'vitest'

import {
  ADMIN_ROLES,
  GRANULARITIES,
  dashboardRangeSchema,
  isAdminRole,
  type Granularity,
} from '@/lib/ai-monitoring/ai-dashboard-types'
import type { UserRole } from '@/lib/notification/notification-types'

describe('GRANULARITIES', () => {
  it('exposes DAY / WEEK / MONTH only, in that order', () => {
    expect(GRANULARITIES).toEqual(['DAY', 'WEEK', 'MONTH'])
  })

  it('infers Granularity as a literal union of the enum members', () => {
    const values: readonly Granularity[] = ['DAY', 'WEEK', 'MONTH']
    expect(values).toHaveLength(3)
  })
})

describe('dashboardRangeSchema', () => {
  it('accepts from === to with any granularity', () => {
    const at = new Date('2026-04-01T00:00:00Z')
    const result = dashboardRangeSchema.safeParse({ from: at, to: at, granularity: 'DAY' })
    expect(result.success).toBe(true)
  })

  it('accepts from < to with granularity WEEK', () => {
    const from = new Date('2026-04-01T00:00:00Z')
    const to = new Date('2026-04-30T00:00:00Z')
    const result = dashboardRangeSchema.safeParse({ from, to, granularity: 'WEEK' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.granularity).toBe('WEEK')
    }
  })

  it('rejects from > to', () => {
    const from = new Date('2026-05-01T00:00:00Z')
    const to = new Date('2026-04-01T00:00:00Z')
    const result = dashboardRangeSchema.safeParse({ from, to, granularity: 'MONTH' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('from must be <= to')
    }
  })

  it('rejects unknown granularity values', () => {
    const at = new Date('2026-04-01T00:00:00Z')
    const result = dashboardRangeSchema.safeParse({ from: at, to: at, granularity: 'HOUR' })
    expect(result.success).toBe(false)
  })

  it('rejects non-Date from / to', () => {
    const result = dashboardRangeSchema.safeParse({
      from: '2026-04-01',
      to: '2026-04-02',
      granularity: 'DAY',
    })
    expect(result.success).toBe(false)
  })
})

describe('isAdminRole / ADMIN_ROLES', () => {
  it('ADMIN_ROLES contains ADMIN only', () => {
    expect(ADMIN_ROLES).toEqual(['ADMIN'])
  })

  it('returns true for ADMIN', () => {
    expect(isAdminRole('ADMIN')).toBe(true)
  })

  it.each<UserRole>(['HR_MANAGER', 'MANAGER', 'EMPLOYEE'])('returns false for %s', (role) => {
    expect(isAdminRole(role)).toBe(false)
  })
})
