import type { UserRole } from '@/lib/notification/notification-types'
import type {
  DashboardAggregateRow,
  DashboardRepository,
  DashboardService,
  DashboardSummary,
  EmployeeDashboardRow,
  KpiMetric,
} from './dashboard-types'

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 10000) / 100
}

function buildCommonMetrics(
  aggregate: DashboardAggregateRow,
  employeeCount: number,
): readonly KpiMetric[] {
  return [
    {
      key: 'employeeCount',
      label: '社員数',
      value: employeeCount,
      unit: 'count',
    },
    {
      key: 'evaluationCompletionRate',
      label: '評価完了率',
      value: toPercent(aggregate.completedEvaluations, aggregate.totalEvaluations),
      unit: 'percent',
    },
    {
      key: 'goalAchievementRate',
      label: '目標達成率',
      value: toPercent(aggregate.completedGoals, aggregate.totalGoals),
      unit: 'percent',
    },
    {
      key: 'skillCoverageRate',
      label: 'スキルカバレッジ',
      value: toPercent(aggregate.coveredSkills, aggregate.totalSkills),
      unit: 'percent',
    },
  ]
}

function buildEmployeeMetrics(aggregate: EmployeeDashboardRow): readonly KpiMetric[] {
  return [
    {
      key: 'myFinalScore',
      label: '自分の評価',
      value: aggregate.latestFinalScore ?? 0,
      unit: 'score',
    },
    {
      key: 'myGoalProgressRate',
      label: '自分の目標達成率',
      value: toPercent(aggregate.completedGoals, aggregate.totalGoals),
      unit: 'percent',
    },
    {
      key: 'skillCoverageRate',
      label: '自分のスキルカバレッジ',
      value: toPercent(aggregate.coveredSkills, aggregate.totalSkills),
      unit: 'percent',
    },
    {
      key: 'myIncentiveScore',
      label: '自分のインセンティブ',
      value: aggregate.latestIncentiveScore ?? 0,
      unit: 'score',
    },
  ]
}

function buildEmptyStateMessage(metrics: readonly KpiMetric[]): string | null {
  const hasPositiveMetric = metrics.some((metric) => metric.value > 0)
  return hasPositiveMetric
    ? null
    : 'まだ表示できるデータがありません。評価、目標、スキル登録が進むとここにKPIが表示されます。'
}

class DashboardServiceImpl implements DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async getKpiSummary(role: UserRole, userId: string): Promise<DashboardSummary> {
    if (role === 'ADMIN' || role === 'HR_MANAGER') {
      const [employeeCount, aggregate] = await Promise.all([
        this.repository.countEmployees(),
        this.repository.getCompanyAggregate(),
      ])
      const metrics = buildCommonMetrics(aggregate, employeeCount)
      return {
        role,
        scopeUserId: userId,
        metrics,
        emptyStateMessage: buildEmptyStateMessage(metrics),
      }
    }

    if (role === 'MANAGER') {
      const [teamMemberCount, aggregate] = await Promise.all([
        this.repository.countManagedMembers(userId),
        this.repository.getManagerAggregate(userId),
      ])
      const metrics: readonly KpiMetric[] = [
        {
          key: 'teamMemberCount',
          label: '担当メンバー数',
          value: teamMemberCount,
          unit: 'count',
        },
        ...buildCommonMetrics(aggregate, teamMemberCount).filter(
          (metric) => metric.key !== 'employeeCount',
        ),
      ]
      return {
        role,
        scopeUserId: userId,
        metrics,
        emptyStateMessage: buildEmptyStateMessage(metrics),
      }
    }

    const aggregate = await this.repository.getEmployeeAggregate(userId)
    const metrics = buildEmployeeMetrics(aggregate)
    return {
      role,
      scopeUserId: userId,
      metrics,
      emptyStateMessage: buildEmptyStateMessage(metrics),
    }
  }
}

export function createDashboardService(repository: DashboardRepository): DashboardService {
  return new DashboardServiceImpl(repository)
}
