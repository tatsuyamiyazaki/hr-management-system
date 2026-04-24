import { describe, expect, it } from 'vitest'
import {
  getAttritionRiskReport,
  getDepartmentCompletions,
  getGoalAchievementReport,
  getReportSchedules,
  getSkillDistributionReport,
  updateReportSchedule,
} from '@/lib/reports/report-data'

describe('report data', () => {
  it('returns department completion statuses by threshold', () => {
    const completions = getDepartmentCompletions('2026-Q1')

    expect(completions).toContainEqual({
      departmentName: '経営管理部',
      completionRate: 100,
      status: 'DONE',
    })
    expect(completions.some((completion) => completion.status === 'WARNING')).toBe(true)
    expect(completions.every((completion) => completion.completionRate >= 0)).toBe(true)
  })

  it('returns the scheduled reports in table-ready shape', () => {
    const schedules = getReportSchedules()

    expect(schedules).toHaveLength(4)
    expect(schedules[0]).toMatchObject({
      reportName: '月次 評価サマリ',
      recipients: 'HR部門全員',
      frequency: 'MONTHLY',
    })
  })

  it('updates editable schedule fields without mutating the original schedule', () => {
    const before = getReportSchedules().find((schedule) => schedule.id === 'schedule-1')
    const updated = updateReportSchedule('schedule-1', {
      frequency: 'QUARTERLY',
      nextDelivery: '2026-07-01',
    })

    expect(updated).toMatchObject({
      id: 'schedule-1',
      frequency: 'QUARTERLY',
      nextDelivery: '2026-07-01',
    })
    expect(before?.frequency).toBe('MONTHLY')
  })

  it('returns placeholder data for the non-summary report cards', () => {
    expect(getGoalAchievementReport('2026-Q1').reportType).toBe('GOAL_ACHIEVEMENT')
    expect(getSkillDistributionReport().reportType).toBe('SKILL_DISTRIBUTION')
    expect(getAttritionRiskReport().reportType).toBe('ATTRITION_RISK')
  })
})
