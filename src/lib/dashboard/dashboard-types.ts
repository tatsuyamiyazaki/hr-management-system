import { z } from 'zod'
import type { UserRole } from '@/lib/notification/notification-types'
import type { ExportJobId } from '@/lib/export/export-types'

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

export interface DashboardTrendFilter {
  readonly departmentIds: readonly string[]
  readonly cycleIds: readonly string[]
  readonly from: Date | null
  readonly to: Date | null
}

export interface DashboardTrendPoint {
  readonly cycleId: string
  readonly cycleName: string
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly score: number
}

export interface DashboardTrendSummary {
  readonly role: UserRole
  readonly scopeUserId: string
  readonly filters: DashboardTrendFilter
  readonly points: readonly DashboardTrendPoint[]
  readonly emptyStateMessage: string | null
}

export interface DashboardExportInput {
  readonly format: 'pdf' | 'csv'
  readonly cycleId: string | null
  readonly departmentIds: readonly string[]
  readonly from: Date | null
  readonly to: Date | null
}

export interface DashboardAuditContext {
  readonly userId: string
  readonly ipAddress: string
  readonly userAgent: string
}

export interface DashboardRepository {
  countEmployees(): Promise<number>
  countManagedMembers(managerId: string): Promise<number>
  getCompanyAggregate(): Promise<DashboardAggregateRow>
  getManagerAggregate(managerId: string): Promise<DashboardAggregateRow>
  getEmployeeAggregate(userId: string): Promise<EmployeeDashboardRow>
  listCompanyTrend(filter: DashboardTrendFilter): Promise<readonly DashboardTrendPoint[]>
  listManagerTrend(
    managerId: string,
    filter: DashboardTrendFilter,
  ): Promise<readonly DashboardTrendPoint[]>
  listEmployeeTrend(
    userId: string,
    filter: DashboardTrendFilter,
  ): Promise<readonly DashboardTrendPoint[]>
}

export interface DashboardService {
  getKpiSummary(role: UserRole, userId: string): Promise<DashboardSummary>
  getTrendSummary(
    role: UserRole,
    userId: string,
    filter: Partial<DashboardTrendFilter>,
  ): Promise<DashboardTrendSummary>
  exportReport(
    role: UserRole,
    userId: string,
    input: DashboardExportInput,
    context: DashboardAuditContext,
  ): Promise<{ jobId: ExportJobId }>
}

export const dashboardQuerySchema = z.object({})

export const dashboardTrendQuerySchema = z
  .object({
    departmentIds: z.array(z.string().min(1)).default([]),
    cycleIds: z.array(z.string().min(1)).default([]),
    from: z.date().nullable().default(null),
    to: z.date().nullable().default(null),
  })
  .refine(
    (value) =>
      value.from === null || value.to === null || value.from.getTime() <= value.to.getTime(),
    {
      message: 'from must be earlier than or equal to to',
      path: ['from'],
    },
  )

export const dashboardExportBodySchema = z
  .object({
    format: z.enum(['pdf', 'csv']),
    cycleId: z.string().min(1).nullable().default(null),
    departmentIds: z.array(z.string().min(1)).default([]),
    from: z.date().nullable().default(null),
    to: z.date().nullable().default(null),
  })
  .refine(
    (value) =>
      value.from === null || value.to === null || value.from.getTime() <= value.to.getTime(),
    {
      message: 'from must be earlier than or equal to to',
      path: ['from'],
    },
  )
