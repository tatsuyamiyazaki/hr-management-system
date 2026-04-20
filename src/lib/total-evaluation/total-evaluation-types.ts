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

export interface TotalEvaluationPreview {
  readonly cycleId: string
  readonly results: TotalEvaluationResult[]
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
}

export interface GradeWeightProvider {
  findGradeWeights(gradeId: string): Promise<GradeWeights | null>
}

export interface IncentiveAdjustmentProvider {
  getAdjustmentForTotalEvaluation(cycleId: string): Promise<Map<string, number>>
}

export const totalEvaluationCalculationPayloadSchema = z.object({
  cycleId: z.string().min(1),
  subjectId: z.string().min(1),
})

export type TotalEvaluationCalculationPayload = z.infer<
  typeof totalEvaluationCalculationPayloadSchema
>

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
