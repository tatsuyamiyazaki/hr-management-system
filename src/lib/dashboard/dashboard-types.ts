import { z } from 'zod'
import type { UserRole } from '@/lib/notification/notification-types'

export interface KpiMetric {
  readonly key:
    | 'employeeCount'
    | 'evaluationCompletionRate'
    | 'goalAchievementRate'
    | 'skillCoverageRate'
    | 'teamMemberCount'
    | 'myFinalScore'
    | 'myGoalProgressRate'
    | 'myIncentiveScore'
  readonly label: string
  readonly value: number
  readonly unit: 'count' | 'percent' | 'score'
}

export interface DashboardSummary {
  readonly role: UserRole
  readonly scopeUserId: string
  readonly metrics: readonly KpiMetric[]
  readonly emptyStateMessage: string | null
}

export interface DashboardAggregateRow {
  readonly completedEvaluations: number
  readonly totalEvaluations: number
  readonly completedGoals: number
  readonly totalGoals: number
  readonly coveredSkills: number
  readonly totalSkills: number
}

export interface EmployeeDashboardRow extends DashboardAggregateRow {
  readonly latestFinalScore: number | null
  readonly latestIncentiveScore: number | null
}

export interface DashboardRepository {
  countEmployees(): Promise<number>
  countManagedMembers(managerId: string): Promise<number>
  getCompanyAggregate(): Promise<DashboardAggregateRow>
  getManagerAggregate(managerId: string): Promise<DashboardAggregateRow>
  getEmployeeAggregate(userId: string): Promise<EmployeeDashboardRow>
}

export interface DashboardService {
  getKpiSummary(role: UserRole, userId: string): Promise<DashboardSummary>
}

export const dashboardQuerySchema = z.object({})
