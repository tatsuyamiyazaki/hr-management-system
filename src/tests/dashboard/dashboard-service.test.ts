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
    listCompanyTrend: async () => [
      {
        cycleId: 'cycle-1',
        cycleName: '2025 Q3',
        periodStart: new Date('2025-07-01T00:00:00.000Z'),
        periodEnd: new Date('2025-09-30T23:59:59.999Z'),
        score: 71.2,
      },
      {
        cycleId: 'cycle-2',
        cycleName: '2025 Q4',
        periodStart: new Date('2025-10-01T00:00:00.000Z'),
        periodEnd: new Date('2025-12-31T23:59:59.999Z'),
        score: 74.8,
      },
      {
        cycleId: 'cycle-3',
        cycleName: '2026 Q1',
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2026-03-31T23:59:59.999Z'),
        score: 79.5,
      },
      {
        cycleId: 'cycle-4',
        cycleName: '2026 Q2',
        periodStart: new Date('2026-04-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T23:59:59.999Z'),
        score: 81.4,
      },
    ],
    listManagerTrend: async () => [
      {
        cycleId: 'cycle-2',
        cycleName: '2025 Q4',
        periodStart: new Date('2025-10-01T00:00:00.000Z'),
        periodEnd: new Date('2025-12-31T23:59:59.999Z'),
        score: 76.1,
      },
    ],
    listEmployeeTrend: async () => [
      {
        cycleId: 'cycle-2',
        cycleName: '2025 Q4',
        periodStart: new Date('2025-10-01T00:00:00.000Z'),
        periodEnd: new Date('2025-12-31T23:59:59.999Z'),
        score: 80.4,
      },
    ],
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

  it('HR_MANAGER のトレンドは新しい 3 サイクルに絞って返す', async () => {
    const service = createDashboardService(makeRepository())

    const result = await service.getTrendSummary('HR_MANAGER', 'hr-1', {})

    expect(result.points.map((point) => point.cycleId)).toEqual(['cycle-2', 'cycle-3', 'cycle-4'])
    expect(result.filters.departmentIds).toEqual([])
    expect(result.emptyStateMessage).toBeNull()
  })

  it('トレンド取得時はフィルタを repository に渡す', async () => {
    let received:
      | {
          readonly departmentIds: readonly string[]
          readonly cycleIds: readonly string[]
          readonly from: Date | null
          readonly to: Date | null
        }
      | undefined
    const service = createDashboardService(
      makeRepository({
        listCompanyTrend: async (filter) => {
          received = filter
          return []
        },
      }),
    )

    const result = await service.getTrendSummary('ADMIN', 'admin-1', {
      departmentIds: ['dept-1'],
      cycleIds: ['cycle-9'],
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-31T23:59:59.999Z'),
    })

    expect(received).toEqual({
      departmentIds: ['dept-1'],
      cycleIds: ['cycle-9'],
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-31T23:59:59.999Z'),
    })
    expect(result.emptyStateMessage).toContain('トレンドを表示できるデータがありません')
  })
})
