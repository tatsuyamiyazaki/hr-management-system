import type {
  GradeThresholdProvider,
  GradeWeightProvider,
  GradeWeights,
  IncentiveAdjustmentProvider,
  TotalEvaluationAuditLogger,
  TotalEvaluationBoundaryThreshold,
  TotalEvaluationCalculationInput,
  TotalEvaluationJobQueue,
  TotalEvaluationOverrideWeightInput,
  TotalEvaluationPreview,
  TotalEvaluationPreviewResult,
  TotalEvaluationRepository,
  TotalEvaluationResult,
  TotalEvaluationScheduleResult,
  TotalEvaluationService,
  TotalEvaluationWeightOverride,
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
  readonly gradeThresholdProvider?: GradeThresholdProvider
  readonly auditLogger?: TotalEvaluationAuditLogger
  readonly jobQueue?: TotalEvaluationJobQueue
  readonly clock?: () => Date
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

function toOverrideMap(
  overrides: readonly TotalEvaluationWeightOverride[],
): ReadonlyMap<string, TotalEvaluationWeightOverride> {
  return new Map(overrides.map((override) => [override.subjectId, override]))
}

function toWeights(
  input: TotalEvaluationCalculationInput,
  gradeWeights: GradeWeights,
  override?: TotalEvaluationWeightOverride | null,
): GradeWeights {
  if (!override) return gradeWeights
  return {
    gradeId: input.gradeId,
    label: gradeWeights.label,
    performanceWeight: override.performanceWeight,
    goalWeight: override.goalWeight,
    feedbackWeight: override.feedbackWeight,
  }
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
    gradeId: params.input.gradeId,
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

function buildPreviewResult(
  result: TotalEvaluationResult,
  overrideMap: ReadonlyMap<string, TotalEvaluationWeightOverride>,
  thresholds: readonly TotalEvaluationBoundaryThreshold[],
): TotalEvaluationPreviewResult {
  let nearestGradeThresholdScore: number | null = null
  let thresholdDistancePercent: number | null = null

  for (const threshold of thresholds) {
    if (threshold.score <= 0) continue
    const distancePercent = Math.abs(result.finalScore - threshold.score) / threshold.score
    if (thresholdDistancePercent === null || distancePercent < thresholdDistancePercent) {
      thresholdDistancePercent = distancePercent
      nearestGradeThresholdScore = threshold.score
    }
  }

  return {
    ...result,
    hasWeightOverride: overrideMap.has(result.subjectId),
    isNearGradeThreshold: thresholdDistancePercent !== null && thresholdDistancePercent <= 0.03,
    nearestGradeThresholdScore,
    thresholdDistancePercent:
      thresholdDistancePercent === null
        ? null
        : roundScore(thresholdDistancePercent * 10000) / 10000,
  }
}

class TotalEvaluationServiceImpl implements TotalEvaluationService {
  private readonly repository: TotalEvaluationRepository
  private readonly gradeWeightProvider: GradeWeightProvider
  private readonly incentiveAdjustmentProvider: IncentiveAdjustmentProvider
  private readonly gradeThresholdProvider?: GradeThresholdProvider
  private readonly auditLogger?: TotalEvaluationAuditLogger
  private readonly jobQueue?: TotalEvaluationJobQueue
  private readonly clock: () => Date

  constructor(deps: TotalEvaluationServiceDeps) {
    this.repository = deps.repository
    this.gradeWeightProvider = deps.gradeWeightProvider
    this.incentiveAdjustmentProvider = deps.incentiveAdjustmentProvider
    this.gradeThresholdProvider = deps.gradeThresholdProvider
    this.auditLogger = deps.auditLogger
    this.jobQueue = deps.jobQueue
    this.clock = deps.clock ?? (() => new Date())
  }

  async calculateAll(cycleId: string): Promise<TotalEvaluationResult[]> {
    const inputs = await this.repository.listCalculationInputs(cycleId)
    const adjustments =
      await this.incentiveAdjustmentProvider.getAdjustmentForTotalEvaluation(cycleId)
    const overrideMap = toOverrideMap(await this.repository.listWeightOverrides(cycleId))

    const results = await Promise.all(
      inputs.map((input) =>
        this.calculateInput(
          input,
          adjustments.get(input.subjectId) ?? 0,
          overrideMap.get(input.subjectId),
        ),
      ),
    )

    await this.repository.upsertCalculatedResults(results)
    return results
  }

  async calculateSubject(cycleId: string, subjectId: string): Promise<TotalEvaluationResult> {
    const input = await this.repository.findCalculationInput(cycleId, subjectId)
    if (!input) throw new TotalEvaluationInputNotFoundError(cycleId, subjectId)

    const adjustments =
      await this.incentiveAdjustmentProvider.getAdjustmentForTotalEvaluation(cycleId)
    const override = await this.repository.findWeightOverride(cycleId, subjectId)
    const result = await this.calculateInput(input, adjustments.get(subjectId) ?? 0, override)

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
    const [results, overrides, thresholds] = await Promise.all([
      this.repository.listPreviewResults(cycleId),
      this.repository.listWeightOverrides(cycleId),
      this.gradeThresholdProvider?.listThresholds(cycleId) ?? Promise.resolve([]),
    ])
    const overrideMap = toOverrideMap(overrides)

    return {
      cycleId,
      results: results.map((result) => buildPreviewResult(result, overrideMap, thresholds)),
    }
  }

  async getWeightOverride(
    cycleId: string,
    subjectId: string,
  ): Promise<TotalEvaluationWeightOverride | null> {
    return this.repository.findWeightOverride(cycleId, subjectId)
  }

  async overrideWeight(input: TotalEvaluationOverrideWeightInput): Promise<TotalEvaluationResult> {
    const calculationInput = await this.repository.findCalculationInput(
      input.cycleId,
      input.subjectId,
    )
    if (!calculationInput) {
      throw new TotalEvaluationInputNotFoundError(input.cycleId, input.subjectId)
    }

    const override = await this.repository.upsertWeightOverride({
      cycleId: input.cycleId,
      subjectId: input.subjectId,
      performanceWeight: input.performanceWeight,
      goalWeight: input.goalWeight,
      feedbackWeight: input.feedbackWeight,
      reason: input.reason,
      adjustedBy: input.adjustedBy,
    })

    const adjustments = await this.incentiveAdjustmentProvider.getAdjustmentForTotalEvaluation(
      input.cycleId,
    )
    const result = await this.calculateInput(
      calculationInput,
      adjustments.get(input.subjectId) ?? 0,
      override,
    )
    await this.repository.upsertCalculatedResults([result])

    if (this.auditLogger) {
      await this.auditLogger.emit({
        userId: input.adjustedBy,
        action: 'RECORD_UPDATE',
        resourceType: 'EVALUATION',
        resourceId: input.subjectId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        before: null,
        after: {
          cycleId: override.cycleId,
          subjectId: override.subjectId,
          performanceWeight: override.performanceWeight,
          goalWeight: override.goalWeight,
          feedbackWeight: override.feedbackWeight,
          reason: override.reason,
        },
      })
    }

    return result
  }

  private async calculateInput(
    input: TotalEvaluationCalculationInput,
    incentiveAdjustment: number,
    override?: TotalEvaluationWeightOverride | null,
  ): Promise<TotalEvaluationResult> {
    const gradeWeights = await this.gradeWeightProvider.findGradeWeights(input.gradeId)
    if (!gradeWeights) throw new TotalEvaluationGradeNotFoundError(input.gradeId)

    return buildResult({
      input,
      weights: toWeights(input, gradeWeights, override),
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
