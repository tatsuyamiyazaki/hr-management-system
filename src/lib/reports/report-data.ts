import type {
  DepartmentCompletion,
  FrequencyType,
  ReportCard,
  ReportInsight,
  ReportSchedule,
} from './report-types'

export const REPORT_CARDS: readonly ReportCard[] = [
  {
    type: 'EVALUATION_SUMMARY',
    title: '評価サマリ',
    description: '完了率・評価分布・偏差分析',
  },
  {
    type: 'GOAL_ACHIEVEMENT',
    title: '目標達成レポート',
    description: 'OKR/MBO別の達成状況',
  },
  {
    type: 'SKILL_DISTRIBUTION',
    title: 'スキル分布',
    description: '部署×カテゴリのスキルヒートマップ',
  },
  {
    type: 'ATTRITION_RISK',
    title: '離職リスク',
    description: 'AIによる離職リスク予測スコア',
  },
] as const

const COMPLETION_BY_PERIOD: Record<string, readonly Omit<DepartmentCompletion, 'status'>[]> = {
  '2026-Q1': [
    { departmentName: 'プロダクト本部', completionRate: 92 },
    { departmentName: 'エンジニアリング部', completionRate: 84 },
    { departmentName: 'デザイン部', completionRate: 76 },
    { departmentName: 'セールス本部', completionRate: 68 },
    { departmentName: 'カスタマーサクセス部', completionRate: 88 },
    { departmentName: '経営管理部', completionRate: 100 },
  ],
  '2025-Q4': [
    { departmentName: 'プロダクト本部', completionRate: 96 },
    { departmentName: 'エンジニアリング部', completionRate: 91 },
    { departmentName: 'デザイン部', completionRate: 83 },
    { departmentName: 'セールス本部', completionRate: 79 },
    { departmentName: 'カスタマーサクセス部', completionRate: 86 },
    { departmentName: '経営管理部', completionRate: 100 },
  ],
  '2025-Q3': [
    { departmentName: 'プロダクト本部', completionRate: 89 },
    { departmentName: 'エンジニアリング部', completionRate: 81 },
    { departmentName: 'デザイン部', completionRate: 74 },
    { departmentName: 'セールス本部', completionRate: 71 },
    { departmentName: 'カスタマーサクセス部', completionRate: 82 },
    { departmentName: '経営管理部', completionRate: 97 },
  ],
}

const REPORT_SCHEDULES: readonly ReportSchedule[] = [
  {
    id: 'schedule-1',
    reportName: '月次 評価サマリ',
    recipients: 'HR部門全員',
    frequency: 'MONTHLY',
    nextDelivery: '2026-05-01',
  },
  {
    id: 'schedule-2',
    reportName: '四半期 目標達成レポート',
    recipients: '経営会議メンバー',
    frequency: 'QUARTERLY',
    nextDelivery: '2026-07-03',
  },
  {
    id: 'schedule-3',
    reportName: '週次 離職リスク速報',
    recipients: '人事企画チーム',
    frequency: 'WEEKLY',
    nextDelivery: '2026-04-27',
  },
  {
    id: 'schedule-4',
    reportName: 'スキル分布アップデート',
    recipients: '部門長',
    frequency: 'MONTHLY',
    nextDelivery: '2026-05-10',
  },
]

function getCompletionStatus(rate: number): DepartmentCompletion['status'] {
  if (rate === 100) return 'DONE'
  if (rate >= 80) return 'COMPLETE'
  return 'WARNING'
}

export function getDepartmentCompletions(period = '2026-Q1'): readonly DepartmentCompletion[] {
  const rows = COMPLETION_BY_PERIOD[period] ?? COMPLETION_BY_PERIOD['2026-Q1'] ?? []
  return rows.map((row) => ({
    ...row,
    status: getCompletionStatus(row.completionRate),
  }))
}

export function getReportSchedules(): readonly ReportSchedule[] {
  return REPORT_SCHEDULES.map((schedule) => ({ ...schedule }))
}

export function updateReportSchedule(
  id: string,
  patch: Partial<Pick<ReportSchedule, 'recipients' | 'frequency' | 'nextDelivery'>>,
): ReportSchedule | null {
  const schedule = REPORT_SCHEDULES.find((item) => item.id === id)
  if (!schedule) return null
  const frequency = patch.frequency
  return {
    ...schedule,
    recipients: patch.recipients ?? schedule.recipients,
    frequency: isFrequency(frequency) ? frequency : schedule.frequency,
    nextDelivery: patch.nextDelivery ?? schedule.nextDelivery,
  }
}

function isFrequency(value: unknown): value is FrequencyType {
  return value === 'WEEKLY' || value === 'MONTHLY' || value === 'QUARTERLY'
}

export function getGoalAchievementReport(period = '2026-Q1'): ReportInsight {
  return {
    reportType: 'GOAL_ACHIEVEMENT',
    title: `目標達成レポート ${period}`,
    metrics: [
      { label: 'OKR達成率', value: '78%' },
      { label: 'MBO達成率', value: '84%' },
      { label: '未達リスク', value: '12件' },
    ],
  }
}

export function getSkillDistributionReport(): ReportInsight {
  return {
    reportType: 'SKILL_DISTRIBUTION',
    title: 'スキル分布',
    metrics: [
      { label: '重点カテゴリ', value: 'AI活用' },
      { label: '高密度部署', value: 'エンジニアリング部' },
      { label: '育成候補', value: '42名' },
    ],
  }
}

export function getAttritionRiskReport(): ReportInsight {
  return {
    reportType: 'ATTRITION_RISK',
    title: '離職リスク',
    metrics: [
      { label: '高リスク', value: '8名' },
      { label: '中リスク', value: '31名' },
      { label: '先月比', value: '-6%' },
    ],
  }
}
