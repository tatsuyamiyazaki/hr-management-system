import { createDashboardService } from './dashboard-service'
import type {
  DashboardAggregateRow,
  DashboardRepository,
  DashboardTrendFilter,
  DashboardTrendPoint,
  DashboardService,
  EmployeeDashboardRow,
} from './dashboard-types'

const companyAggregate: DashboardAggregateRow = {
  completedEvaluations: 108,
  totalEvaluations: 120,
  completedGoals: 86,
  totalGoals: 120,
  coveredSkills: 412,
  totalSkills: 480,
}

const managerAggregate: DashboardAggregateRow = {
  completedEvaluations: 25,
  totalEvaluations: 30,
  completedGoals: 22,
  totalGoals: 30,
  coveredSkills: 97,
  totalSkills: 120,
}

const employeeAggregate: EmployeeDashboardRow = {
  completedEvaluations: 2,
  totalEvaluations: 2,
  completedGoals: 4,
  totalGoals: 5,
  coveredSkills: 18,
  totalSkills: 24,
  latestFinalScore: 4.2,
  latestIncentiveScore: 3.8,
}

function buildTrendPoints(filter: DashboardTrendFilter): readonly DashboardTrendPoint[] {
  const anchor = filter.to ?? new Date('2026-03-31T00:00:00.000Z')
  const periods = [
    {
      cycleId: 'cycle-2026-01',
      cycleName: '2026 Q1',
      periodEnd: new Date(anchor.getFullYear(), anchor.getMonth() - 2, 31),
      score: 72,
    },
    {
      cycleId: 'cycle-2026-02',
      cycleName: '2026 Q2',
      periodEnd: new Date(anchor.getFullYear(), anchor.getMonth() - 1, 30),
      score: 78,
    },
    {
      cycleId: 'cycle-2026-03',
      cycleName: '2026 Q3',
      periodEnd: new Date(anchor.getFullYear(), anchor.getMonth(), 30),
      score: 84,
    },
  ] as const

  return periods.map((period) => ({
    cycleId: period.cycleId,
    cycleName: period.cycleName,
    periodStart: new Date(period.periodEnd.getFullYear(), period.periodEnd.getMonth(), 1),
    periodEnd: period.periodEnd,
    score: period.score,
  }))
}

const repository: DashboardRepository = {
  async countEmployees(): Promise<number> {
    return 120
  },
  async countManagedMembers(): Promise<number> {
    return 30
  },
  async getCompanyAggregate(): Promise<DashboardAggregateRow> {
    return companyAggregate
  },
  async getManagerAggregate(): Promise<DashboardAggregateRow> {
    return managerAggregate
  },
  async getEmployeeAggregate(): Promise<EmployeeDashboardRow> {
    return employeeAggregate
  },
  async listCompanyTrend(filter: DashboardTrendFilter): Promise<readonly DashboardTrendPoint[]> {
    return buildTrendPoints(filter)
  },
  async listManagerTrend(
    filterOwnerId: string,
    filter: DashboardTrendFilter,
  ): Promise<readonly DashboardTrendPoint[]> {
    void filterOwnerId
    return buildTrendPoints(filter)
  },
  async listEmployeeTrend(
    filterOwnerId: string,
    filter: DashboardTrendFilter,
  ): Promise<readonly DashboardTrendPoint[]> {
    void filterOwnerId
    return buildTrendPoints(filter)
  },
}

export function createDevelopmentDashboardService(): DashboardService {
  return createDashboardService(repository)
}
