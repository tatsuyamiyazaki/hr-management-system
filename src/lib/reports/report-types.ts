export type ReportType =
  | 'EVALUATION_SUMMARY'
  | 'GOAL_ACHIEVEMENT'
  | 'SKILL_DISTRIBUTION'
  | 'ATTRITION_RISK'

export type FrequencyType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY'

export interface DepartmentCompletion {
  readonly departmentName: string
  readonly completionRate: number
  readonly status: 'COMPLETE' | 'WARNING' | 'DONE'
}

export interface ReportSchedule {
  readonly id: string
  readonly reportName: string
  readonly recipients: string
  readonly frequency: FrequencyType
  readonly nextDelivery: string
}

export interface ReportCard {
  readonly type: ReportType
  readonly title: string
  readonly description: string
}

export interface ReportInsight {
  readonly reportType: ReportType
  readonly title: string
  readonly metrics: readonly {
    readonly label: string
    readonly value: string
  }[]
}
