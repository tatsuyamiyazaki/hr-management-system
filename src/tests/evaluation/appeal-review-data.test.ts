import { describe, expect, it } from 'vitest'
import {
  applyAppealAction,
  getAppealsKpi,
  listAppealsForReview,
} from '@/lib/evaluation/appeal-review-data'

describe('appeal review data', () => {
  it('returns the issue KPI values', () => {
    expect(getAppealsKpi()).toEqual({
      underReview: 7,
      avgDays: 3.2,
      nearDeadlineCount: 3,
      monthlyCompleted: 24,
      monthlyCorrected: 11,
      monthlyRejected: 13,
      correctionRate: 45.8,
      correctionRateDelta: 6.9,
    })
  })

  it('lists under-review appeals sorted by priority and deadline', () => {
    const appeals = listAppealsForReview('UNDER_REVIEW')

    expect(appeals).toHaveLength(7)
    expect(appeals[0]).toMatchObject({
      appealNumber: '#APL-2024-0042',
      priority: 'HIGH',
      deadlineDays: 1,
      status: 'UNDER_REVIEW',
    })
    expect(appeals.at(-1)?.priority).toBe('LOW')
  })

  it('returns only pending-info appeals when filtered', () => {
    const appeals = listAppealsForReview('PENDING_INFO')

    expect(appeals).toHaveLength(1)
    expect(appeals[0]?.status).toBe('PENDING_INFO')
  })

  it('maps card actions to the resulting appeal status', () => {
    expect(applyAppealAction('appeal-1', 'request-info')?.status).toBe('PENDING_INFO')
    expect(applyAppealAction('appeal-1', 'reject')?.status).toBe('COMPLETED_REJECTED')
    expect(applyAppealAction('appeal-1', 'correct')?.status).toBe('COMPLETED_CORRECTION')
    expect(applyAppealAction('missing', 'correct')).toBeNull()
  })
})
