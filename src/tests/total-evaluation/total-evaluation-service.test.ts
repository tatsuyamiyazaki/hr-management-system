/**
 * Issue #68 / Task 19.3: TotalEvaluationService tests (Req 12.5, 12.7)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTotalEvaluationService } from '@/lib/total-evaluation/total-evaluation-service'
import type {
  GradeWeightProvider,
  IncentiveAdjustmentProvider,
  TotalEvaluationBoundaryThreshold,
  TotalEvaluationCalculationInput,
  TotalEvaluationCycleCloser,
  TotalEvaluationJobQueue,
  TotalEvaluationRepository,
  TotalEvaluationResult,
  TotalEvaluationWeightOverride,
} from '@/lib/total-evaluation/total-evaluation-types'

function makeInput(
  overrides: Partial<TotalEvaluationCalculationInput> = {},
): TotalEvaluationCalculationInput {
  return {
    cycleId: 'cycle-1',
    subjectId: 'user-1',
    gradeId: 'grade-a',
    performanceScore: 80,
    goalScore: 70,
    feedbackScore: 90,
    ...overrides,
  }
}

function makeResult(overrides: Partial<TotalEvaluationResult> = {}): TotalEvaluationResult {
  return {
    id: 'result-1',
    cycleId: 'cycle-1',
    subjectId: 'user-1',
    gradeId: 'grade-a',
    gradeLabel: 'G3',
    performanceScore: 80,
    goalScore: 70,
    feedbackScore: 95,
    incentiveAdjustment: 5,
    performanceWeight: 0.5,
    goalWeight: 0.3,
    feedbackWeight: 0.2,
    finalScore: 80,
    status: 'CALCULATED',
    calculatedAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeRepo(
  inputs: TotalEvaluationCalculationInput[] = [makeInput()],
): TotalEvaluationRepository {
  return {
    listCalculationInputs: vi.fn().mockResolvedValue(inputs),
    findCalculationInput: vi
      .fn()
      .mockImplementation(
        async (cycleId: string, subjectId: string) =>
          inputs.find((input) => input.cycleId === cycleId && input.subjectId === subjectId) ??
          null,
      ),
    upsertCalculatedResults: vi.fn().mockResolvedValue(undefined),
    listPreviewResults: vi.fn().mockResolvedValue([]),
    listWeightOverrides: vi.fn().mockResolvedValue([]),
    findWeightOverride: vi.fn().mockResolvedValue(null),
    upsertWeightOverride: vi.fn().mockImplementation(async (override) => ({
      id: 'override-1',
      adjustedAt: new Date('2026-04-02T00:00:00.000Z'),
      ...override,
    })),
    finalizeResults: vi
      .fn()
      .mockImplementation(async (cycleId: string, finalizedAt: Date) => [
        makeResult({ cycleId, status: 'FINALIZED', finalizedAt }),
      ]),
    findResult: vi.fn().mockResolvedValue(makeResult({ status: 'FINALIZED' })),
    createCorrection: vi.fn().mockImplementation(async (correction) => ({
      id: 'correction-1',
      correctedAt: new Date('2026-04-03T00:00:00.000Z'),
      ...correction,
    })),
  }
}

function makeGradeProvider(overrides?: Partial<GradeWeightProvider>): GradeWeightProvider {
  return {
    findGradeWeights: vi.fn().mockResolvedValue({
      gradeId: 'grade-a',
      label: 'G3',
      performanceWeight: 0.5,
      goalWeight: 0.3,
      feedbackWeight: 0.2,
    }),
    ...overrides,
  }
}

function makeIncentives(adjustments = new Map<string, number>()): IncentiveAdjustmentProvider {
  return {
    getAdjustmentForTotalEvaluation: vi.fn().mockResolvedValue(adjustments),
  }
}

function makeOverride(
  overrides: Partial<TotalEvaluationWeightOverride> = {},
): TotalEvaluationWeightOverride {
  return {
    id: 'override-1',
    cycleId: 'cycle-1',
    subjectId: 'user-1',
    performanceWeight: 0.4,
    goalWeight: 0.4,
    feedbackWeight: 0.2,
    reason: '評価会議で調整',
    adjustedBy: 'hr-1',
    adjustedAt: new Date('2026-04-02T00:00:00.000Z'),
    ...overrides,
  }
}

function makeBoundaryThresholds(
  thresholds: readonly number[] = [80],
): readonly TotalEvaluationBoundaryThreshold[] {
  return thresholds.map((score, index) => ({
    id: `threshold-${index + 1}`,
    label: `T${index + 1}`,
    score,
  }))
}

describe('TotalEvaluationService.calculateAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('等級ウェイトとインセンティブ補正で最終スコアを計算する', async () => {
    const repo = makeRepo([makeInput()])
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(new Map([['user-1', 5]])),
    })

    const results = await svc.calculateAll('cycle-1')

    expect(results).toEqual([
      expect.objectContaining({
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        gradeId: 'grade-a',
        gradeLabel: 'G3',
        performanceScore: 80,
        goalScore: 70,
        feedbackScore: 95,
        incentiveAdjustment: 5,
        performanceWeight: 0.5,
        goalWeight: 0.3,
        feedbackWeight: 0.2,
        finalScore: 80,
        status: 'CALCULATED',
      }),
    ])
    expect(repo.upsertCalculatedResults).toHaveBeenCalledWith(results)
  })

  it('個別ウェイト上書きがある社員は上書きウェイトで再計算する', async () => {
    const repo = makeRepo([makeInput()])
    repo.listWeightOverrides = vi.fn().mockResolvedValue([makeOverride()])
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(new Map([['user-1', 5]])),
    })

    const [result] = await svc.calculateAll('cycle-1')

    expect(result).toEqual(
      expect.objectContaining({
        performanceWeight: 0.4,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
        feedbackScore: 95,
        finalScore: 79,
      }),
    )
  })
})

describe('TotalEvaluationService.previewBeforeFinalize', () => {
  it('確定前プレビューとして一覧を返す', async () => {
    const previewRows = [makeResult()]
    const repo = makeRepo([])
    repo.listPreviewResults = vi.fn().mockResolvedValue(previewRows)
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(),
      gradeThresholdProvider: {
        listThresholds: vi.fn().mockResolvedValue([]),
      },
    })

    await expect(svc.previewBeforeFinalize('cycle-1')).resolves.toEqual({
      cycleId: 'cycle-1',
      results: [
        {
          ...previewRows[0],
          hasWeightOverride: false,
          isNearGradeThreshold: false,
          nearestGradeThresholdScore: null,
          thresholdDistancePercent: null,
        },
      ],
    })
  })

  it('上書き有無と等級境界フラグを付けて返す', async () => {
    const previewRows = [makeResult({ performanceWeight: 0.4, goalWeight: 0.4, finalScore: 78 })]
    const repo = makeRepo([])
    repo.listPreviewResults = vi.fn().mockResolvedValue(previewRows)
    repo.listWeightOverrides = vi.fn().mockResolvedValue([makeOverride()])
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(),
      gradeThresholdProvider: {
        listThresholds: vi.fn().mockResolvedValue(makeBoundaryThresholds([80, 60])),
      },
    })

    await expect(svc.previewBeforeFinalize('cycle-1')).resolves.toEqual({
      cycleId: 'cycle-1',
      results: [
        {
          ...previewRows[0],
          hasWeightOverride: true,
          isNearGradeThreshold: true,
          nearestGradeThresholdScore: 80,
          thresholdDistancePercent: 0.025,
        },
      ],
    })
  })
})

describe('TotalEvaluationService.overrideWeight', () => {
  it('上書きウェイトを保存して再計算し、監査ログを記録する', async () => {
    const repo = makeRepo([makeInput()])
    const auditLogger = { emit: vi.fn().mockResolvedValue(undefined) }
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(new Map([['user-1', 5]])),
      auditLogger,
    })

    const result = await svc.overrideWeight({
      cycleId: 'cycle-1',
      subjectId: 'user-1',
      performanceWeight: 0.4,
      goalWeight: 0.4,
      feedbackWeight: 0.2,
      reason: '評価会議で調整',
      adjustedBy: 'hr-1',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(repo.upsertWeightOverride).toHaveBeenCalledWith({
      cycleId: 'cycle-1',
      subjectId: 'user-1',
      performanceWeight: 0.4,
      goalWeight: 0.4,
      feedbackWeight: 0.2,
      reason: '評価会議で調整',
      adjustedBy: 'hr-1',
    })
    expect(result).toEqual(
      expect.objectContaining({
        performanceWeight: 0.4,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
        feedbackScore: 95,
        finalScore: 79,
      }),
    )
    expect(auditLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'hr-1',
        action: 'RECORD_UPDATE',
        resourceType: 'EVALUATION',
        resourceId: 'user-1',
      }),
    )
  })
})

describe('TotalEvaluationService.finalize', () => {
  it('全社員の総合評価を確定し、評価サイクルをクローズし、監査ログを残す', async () => {
    const repo = makeRepo([])
    const auditLogger = { emit: vi.fn().mockResolvedValue(undefined) }
    const cycleCloser: TotalEvaluationCycleCloser = {
      closeCycle: vi.fn().mockResolvedValue(undefined),
    }
    const finalizedAt = new Date('2026-04-05T00:00:00.000Z')
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(),
      auditLogger,
      cycleCloser,
      clock: () => finalizedAt,
    })

    const results = await svc.finalize({
      cycleId: 'cycle-1',
      finalizedBy: 'hr-1',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(repo.finalizeResults).toHaveBeenCalledWith('cycle-1', finalizedAt)
    expect(cycleCloser.closeCycle).toHaveBeenCalledWith('cycle-1')
    expect(results).toEqual([
      expect.objectContaining({
        status: 'FINALIZED',
        finalizedAt,
      }),
    ])
    expect(auditLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'hr-1',
        action: 'EVALUATION_FINALIZED',
        resourceType: 'EVALUATION_CYCLE',
        resourceId: 'cycle-1',
      }),
    )
  })
})

describe('TotalEvaluationService.correctAfterFinalize', () => {
  it('確定後に ADMIN 修正を保存し、履歴を残し、監査ログを記録する', async () => {
    const repo = makeRepo([])
    const auditLogger = { emit: vi.fn().mockResolvedValue(undefined) }
    repo.findResult = vi.fn().mockResolvedValue(
      makeResult({
        id: 'result-1',
        status: 'FINALIZED',
        finalizedAt: new Date('2026-04-05T00:00:00.000Z'),
      }),
    )
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(),
      auditLogger,
      clock: () => new Date('2026-04-06T00:00:00.000Z'),
    })

    const result = await svc.correctAfterFinalize({
      cycleId: 'cycle-1',
      subjectId: 'user-1',
      performanceScore: 85,
      goalScore: 70,
      feedbackScore: 95,
      performanceWeight: 0.5,
      goalWeight: 0.3,
      feedbackWeight: 0.2,
      incentiveAdjustment: 5,
      reason: '監査後に修正',
      correctedBy: 'admin-1',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(repo.createCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        reason: '監査後に修正',
        correctedBy: 'admin-1',
        before: expect.objectContaining({
          finalScore: 80,
        }),
        after: expect.objectContaining({
          finalScore: 82.5,
        }),
      }),
    )
    expect(repo.upsertCalculatedResults).toHaveBeenCalledWith([
      expect.objectContaining({
        subjectId: 'user-1',
        status: 'FINALIZED',
        finalScore: 82.5,
      }),
    ])
    expect(result).toEqual(
      expect.objectContaining({
        subjectId: 'user-1',
        status: 'FINALIZED',
        finalScore: 82.5,
      }),
    )
    expect(auditLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'RECORD_UPDATE',
        resourceType: 'EVALUATION',
        resourceId: 'user-1',
      }),
    )
  })
})

describe('TotalEvaluationService.scheduleCalculateAll', () => {
  it('全社員分の計算ジョブを社員単位で投入する', async () => {
    const repo = makeRepo([makeInput({ subjectId: 'user-1' }), makeInput({ subjectId: 'user-2' })])
    const jobQueue: TotalEvaluationJobQueue = {
      enqueue: vi.fn().mockResolvedValue('job-1'),
    }
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(),
      jobQueue,
    })

    const result = await svc.scheduleCalculateAll('cycle-1')

    expect(result).toEqual({ enqueued: 2, jobIds: ['job-1', 'job-1'] })
    expect(jobQueue.enqueue).toHaveBeenNthCalledWith(1, 'total-evaluation-calculate', {
      cycleId: 'cycle-1',
      subjectId: 'user-1',
    })
    expect(jobQueue.enqueue).toHaveBeenNthCalledWith(2, 'total-evaluation-calculate', {
      cycleId: 'cycle-1',
      subjectId: 'user-2',
    })
  })
})
