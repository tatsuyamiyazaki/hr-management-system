import type {
  GradeWeights,
  GradeWeightProvider,
  IncentiveAdjustmentProvider,
  TotalEvaluationCalculationInput,
  TotalEvaluationJobQueue,
  TotalEvaluationRepository,
  TotalEvaluationResult,
  TotalEvaluationScheduleResult,
  TotalEvaluationService,
  TotalEvaluationPreview,
} from './total-evaluation-types'
import {
  TotalEvaluationGradeNotFoundError,
  TotalEvaluationInputNotFoundError,
  TotalEvaluationJobQueueNotConfiguredError,
} from './total-evaluation-types'

export interface TotalEvaluationServiceDeps {
  readonly repository: TotalEvaluationRepository
  readonly gradeWeightProvider: GradeWeightProvider
  readonly incentiveAdjustmentProvider: IncentiveAdjustmentProvider
  readonly jobQueue?: TotalEvaluationJobQueue
  readonly clock?: () => Date
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

function buildResult(params: {
  readonly input: TotalEvaluationCalculationInput
  readonly weights: GradeWeights
  readonly incentiveAdjustment: number
  readonly calculatedAt: Date
}): TotalEvaluationResult {
  const feedbackScore = params.input.feedbackScore + params.incentiveAdjustment
  const finalScore =
    params.input.performanceScore * params.weights.performanceWeight +
    params.input.goalScore * params.weights.goalWeight +
    feedbackScore * params.weights.feedbackWeight

  return {
    cycleId: params.input.cycleId,
    subjectId: params.input.subjectId,
    gradeId: params.weights.gradeId,
    gradeLabel: params.weights.label,
    performanceScore: params.input.performanceScore,
    goalScore: params.input.goalScore,
    feedbackScore: roundScore(feedbackScore),
    incentiveAdjustment: params.incentiveAdjustment,
    performanceWeight: params.weights.performanceWeight,
    goalWeight: params.weights.goalWeight,
    feedbackWeight: params.weights.feedbackWeight,
    finalScore: roundScore(finalScore),
    status: 'CALCULATED',
    calculatedAt: params.calculatedAt,
  }
}

class TotalEvaluationServiceImpl implements TotalEvaluationService {
  private readonly repository: TotalEvaluationRepository
  private readonly gradeWeightProvider: GradeWeightProvider
  private readonly incentiveAdjustmentProvider: IncentiveAdjustmentProvider
  private readonly jobQueue?: TotalEvaluationJobQueue
  private readonly clock: () => Date

  constructor(deps: TotalEvaluationServiceDeps) {
    this.repository = deps.repository
    this.gradeWeightProvider = deps.gradeWeightProvider
    this.incentiveAdjustmentProvider = deps.incentiveAdjustmentProvider
    this.jobQueue = deps.jobQueue
    this.clock = deps.clock ?? (() => new Date())
  }

  async calculateAll(cycleId: string): Promise<TotalEvaluationResult[]> {
    const inputs = await this.repository.listCalculationInputs(cycleId)
    const adjustments =
      await this.incentiveAdjustmentProvider.getAdjustmentForTotalEvaluation(cycleId)

    const results = await Promise.all(
      inputs.map((input) => this.calculateInput(input, adjustments.get(input.subjectId) ?? 0)),
    )

    await this.repository.upsertCalculatedResults(results)
    return results
  }

  async calculateSubject(cycleId: string, subjectId: string): Promise<TotalEvaluationResult> {
    const input = await this.repository.findCalculationInput(cycleId, subjectId)
    if (!input) throw new TotalEvaluationInputNotFoundError(cycleId, subjectId)

    const adjustments =
      await this.incentiveAdjustmentProvider.getAdjustmentForTotalEvaluation(cycleId)
    const result = await this.calculateInput(input, adjustments.get(subjectId) ?? 0)

    await this.repository.upsertCalculatedResults([result])
    return result
  }

  async scheduleCalculateAll(cycleId: string): Promise<TotalEvaluationScheduleResult> {
    if (!this.jobQueue) throw new TotalEvaluationJobQueueNotConfiguredError()

    const inputs = await this.repository.listCalculationInputs(cycleId)
    const jobIds = await Promise.all(
      inputs.map((input) =>
        this.jobQueue!.enqueue('total-evaluation-calculate', {
          cycleId,
          subjectId: input.subjectId,
        }),
      ),
    )

    return { enqueued: jobIds.length, jobIds }
  }

  async previewBeforeFinalize(cycleId: string): Promise<TotalEvaluationPreview> {
    const results = await this.repository.listPreviewResults(cycleId)
    return { cycleId, results }
  }

  private async calculateInput(
    input: TotalEvaluationCalculationInput,
    incentiveAdjustment: number,
  ): Promise<TotalEvaluationResult> {
    const weights = await this.gradeWeightProvider.findGradeWeights(input.gradeId)
    if (!weights) throw new TotalEvaluationGradeNotFoundError(input.gradeId)

    return buildResult({
      input,
      weights,
      incentiveAdjustment,
      calculatedAt: this.clock(),
    })
  }
}

export function createTotalEvaluationService(
  deps: TotalEvaluationServiceDeps,
): TotalEvaluationService {
  return new TotalEvaluationServiceImpl(deps)
}
