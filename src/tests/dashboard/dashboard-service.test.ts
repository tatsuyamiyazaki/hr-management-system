import { describe, expect, it } from 'vitest'
import { createDashboardService } from '@/lib/dashboard/dashboard-service'
import type { DashboardRepository } from '@/lib/dashboard/dashboard-types'

function makeRepository(overrides: Partial<DashboardRepository> = {}): DashboardRepository {
  return {
    countEmployees: async () => 10,
    countManagedMembers: async () => 3,
    getCompanyAggregate: async () => ({
      completedEvaluations: 8,
      totalEvaluations: 10,
      completedGoals: 6,
      totalGoals: 10,
      coveredSkills: 45,
      totalSkills: 60,
    }),
    getManagerAggregate: async () => ({
      completedEvaluations: 2,
      totalEvaluations: 3,
      completedGoals: 1,
      totalGoals: 3,
      coveredSkills: 9,
      totalSkills: 12,
    }),
    getEmployeeAggregate: async () => ({
      completedEvaluations: 1,
      totalEvaluations: 1,
      completedGoals: 2,
      totalGoals: 4,
      coveredSkills: 7,
      totalSkills: 10,
      latestFinalScore: 82.5,
      latestIncentiveScore: 12,
    }),
    ...overrides,
  }
}

describe('DashboardService.getKpiSummary', () => {
  it('ADMIN は全社 KPI を返す', async () => {
    const service = createDashboardService(makeRepository())

    const result = await service.getKpiSummary('ADMIN', 'admin-1')

    expect(result.role).toBe('ADMIN')
    expect(result.metrics.map((metric) => metric.key)).toEqual([
      'employeeCount',
      'evaluationCompletionRate',
      'goalAchievementRate',
      'skillCoverageRate',
    ])
    expect(result.emptyStateMessage).toBeNull()
  })

  it('MANAGER は担当メンバー限定 KPI を返す', async () => {
    const service = createDashboardService(makeRepository())

    const result = await service.getKpiSummary('MANAGER', 'manager-1')

    expect(result.metrics.map((metric) => metric.key)).toEqual([
      'teamMemberCount',
      'evaluationCompletionRate',
      'goalAchievementRate',
      'skillCoverageRate',
    ])
  })

  it('EMPLOYEE は自分の KPI を返す', async () => {
    const service = createDashboardService(makeRepository())

    const result = await service.getKpiSummary('EMPLOYEE', 'emp-1')

    expect(result.metrics.map((metric) => metric.key)).toEqual([
      'myFinalScore',
      'myGoalProgressRate',
      'skillCoverageRate',
      'myIncentiveScore',
    ])
  })

  it('データが空なら empty state メッセージを返す', async () => {
    const service = createDashboardService(
      makeRepository({
        countEmployees: async () => 0,
        countManagedMembers: async () => 0,
        getCompanyAggregate: async () => ({
          completedEvaluations: 0,
          totalEvaluations: 0,
          completedGoals: 0,
          totalGoals: 0,
          coveredSkills: 0,
          totalSkills: 0,
        }),
      }),
    )

    const result = await service.getKpiSummary('HR_MANAGER', 'hr-1')

    expect(result.emptyStateMessage).toContain('まだ表示できるデータがありません')
  })
})
