export type AppealType = 'EVALUATION_RESULT' | 'FEEDBACK' | 'CALIBRATION'
export type AppealStatus =
  | 'UNDER_REVIEW'
  | 'COMPLETED_CORRECTION'
  | 'COMPLETED_REJECTED'
  | 'PENDING_INFO'
export type AppealPriority = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Appeal {
  readonly id: string
  readonly appealNumber: string
  readonly type: AppealType
  readonly title: string
  readonly content: string
  readonly priority: AppealPriority
  readonly deadlineDays: number
  readonly employeeId: string
  readonly employeeName: string
  readonly employeeNumber: string
  readonly avatarColor: string
  readonly submittedAt: string
  readonly status: AppealStatus
}

export interface AppealsKpi {
  readonly underReview: number
  readonly avgDays: number
  readonly nearDeadlineCount: number
  readonly monthlyCompleted: number
  readonly monthlyCorrected: number
  readonly monthlyRejected: number
  readonly correctionRate: number
  readonly correctionRateDelta: number
}
