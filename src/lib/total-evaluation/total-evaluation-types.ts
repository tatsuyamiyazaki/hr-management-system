import { z } from 'zod'

export const TOTAL_EVALUATION_STATUSES = [
  'CALCULATED',
  'PENDING_FINALIZATION',
  'FINALIZED',
] as const

export type TotalEvaluationStatus = (typeof TOTAL_EVALUATION_STATUSES)[number]

export interface TotalEvaluationCalculationInput {
  readonly cycleId: string
  readonly subjectId: string
  readonly gradeId: string
  readonly performanceScore: number
  readonly goalScore: number
  readonly feedbackScore: number
}

export interface GradeWeights {
  readonly gradeId: string
  readonly label: string
  readonly performanceWeight: number
  readonly goalWeight: number
  readonly feedbackWeight: number
}

export interface TotalEvaluationResult {
  readonly id?: string
  readonly cycleId: string
  readonly subjectId: string
  readonly gradeId: string
  readonly gradeLabel: string
  readonly performanceScore: number
  readonly goalScore: number
  readonly feedbackScore: number
  readonly incentiveAdjustment: number
  readonly performanceWeight: number
  readonly goalWeight: number
  readonly feedbackWeight: number
  readonly finalScore: number
  readonly status: TotalEvaluationStatus
  readonly calculatedAt: Date
}

export interface TotalEvaluationWeightOverride {
  readonly id?: string
  readonly cycleId: string
  readonly subjectId: string
  readonly performanceWeight: number
  readonly goalWeight: number
  readonly feedbackWeight: number
  readonly reason: string
  readonly adjustedBy: string
  readonly adjustedAt: Date
}

export interface TotalEvaluationBoundaryThreshold {
  readonly id: string
  readonly label: string
  readonly score: number
}

export interface TotalEvaluationPreviewResult extends TotalEvaluationResult {
  readonly hasWeightOverride: boolean
  readonly isNearGradeThreshold: boolean
  readonly nearestGradeThresholdScore: number | null
  readonly thresholdDistancePercent: number | null
}

export interface TotalEvaluationPreview {
  readonly cycleId: string
  readonly results: TotalEvaluationPreviewResult[]
}

export interface TotalEvaluationScheduleResult {
  readonly enqueued: number
  readonly jobIds: string[]
}

export interface TotalEvaluationRepository {
  listCalculationInputs(cycleId: string): Promise<TotalEvaluationCalculationInput[]>
  findCalculationInput(
    cycleId: string,
    subjectId: string,
  ): Promise<TotalEvaluationCalculationInput | null>
  upsertCalculatedResults(results: TotalEvaluationResult[]): Promise<void>
  listPreviewResults(cycleId: string): Promise<TotalEvaluationResult[]>
  listWeightOverrides(cycleId: string): Promise<TotalEvaluationWeightOverride[]>
  findWeightOverride(
    cycleId: string,
    subjectId: string,
  ): Promise<TotalEvaluationWeightOverride | null>
  upsertWeightOverride(
    override: Omit<TotalEvaluationWeightOverride, 'id' | 'adjustedAt'>,
  ): Promise<TotalEvaluationWeightOverride>
}

export interface GradeWeightProvider {
  findGradeWeights(gradeId: string): Promise<GradeWeights | null>
}

export interface IncentiveAdjustmentProvider {
  getAdjustmentForTotalEvaluation(cycleId: string): Promise<Map<string, number>>
}

export interface GradeThresholdProvider {
  listThresholds(cycleId: string): Promise<readonly TotalEvaluationBoundaryThreshold[]>
}

export const totalEvaluationCalculationPayloadSchema = z.object({
  cycleId: z.string().min(1),
  subjectId: z.string().min(1),
})

export type TotalEvaluationCalculationPayload = z.infer<
  typeof totalEvaluationCalculationPayloadSchema
>

export const totalEvaluationWeightOverrideSchema = z
  .object({
    cycleId: z.string().min(1),
    subjectId: z.string().min(1),
    performanceWeight: z.number().min(0).max(1),
    goalWeight: z.number().min(0).max(1),
    feedbackWeight: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(1000),
  })
  .superRefine((value, ctx) => {
    const sum = value.performanceWeight + value.goalWeight + value.feedbackWeight
    if (Math.abs(sum - 1) > 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Weight sum must equal 1 (got ${sum})`,
        path: ['performanceWeight'],
      })
    }
  })

export type TotalEvaluationWeightOverridePayload = z.infer<
  typeof totalEvaluationWeightOverrideSchema
>

export interface TotalEvaluationOverrideWeightInput extends TotalEvaluationWeightOverridePayload {
  readonly adjustedBy: string
  readonly ipAddress: string
  readonly userAgent: string
}

export interface TotalEvaluationAuditLogger {
  emit(entry: {
    userId: string | null
    action: 'RECORD_UPDATE'
    resourceType: 'EVALUATION'
    resourceId: string | null
    ipAddress: string
    userAgent: string
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
  }): Promise<void>
}

export interface TotalEvaluationJobQueue {
  enqueue(
    name: 'total-evaluation-calculate',
    payload: TotalEvaluationCalculationPayload,
  ): Promise<string>
}

export interface TotalEvaluationService {
  calculateAll(cycleId: string): Promise<TotalEvaluationResult[]>
  calculateSubject(cycleId: string, subjectId: string): Promise<TotalEvaluationResult>
  scheduleCalculateAll(cycleId: string): Promise<TotalEvaluationScheduleResult>
  previewBeforeFinalize(cycleId: string): Promise<TotalEvaluationPreview>
  getWeightOverride(
    cycleId: string,
    subjectId: string,
  ): Promise<TotalEvaluationWeightOverride | null>
  overrideWeight(input: TotalEvaluationOverrideWeightInput): Promise<TotalEvaluationResult>
}

export class TotalEvaluationInputNotFoundError extends Error {
  constructor(cycleId: string, subjectId: string) {
    super(`Total evaluation input not found: cycleId="${cycleId}", subjectId="${subjectId}"`)
    this.name = 'TotalEvaluationInputNotFoundError'
  }
}

export class TotalEvaluationGradeNotFoundError extends Error {
  constructor(gradeId: string) {
    super(`Grade weights not found: gradeId="${gradeId}"`)
    this.name = 'TotalEvaluationGradeNotFoundError'
  }
}

export class TotalEvaluationJobQueueNotConfiguredError extends Error {
  constructor() {
    super('Total evaluation job queue is not configured')
    this.name = 'TotalEvaluationJobQueueNotConfiguredError'
  }
}
