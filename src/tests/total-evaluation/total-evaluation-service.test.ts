/**
 * Issue #66 / Task 19.1: TotalEvaluationService tests (Req 12.1, 12.2, 12.4)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTotalEvaluationService } from '@/lib/total-evaluation/total-evaluation-service'
import type {
  TotalEvaluationCalculationInput,
  TotalEvaluationRepository,
  GradeWeightProvider,
  IncentiveAdjustmentProvider,
  TotalEvaluationJobQueue,
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

describe('TotalEvaluationService.calculateAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('業績・目標・インセンティブ加算後360度点を等級ウェイトで加重平均する', async () => {
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

  it('対象社員ごとに等級マスタのデフォルトウェイトを適用する', async () => {
    const repo = makeRepo([
      makeInput({ subjectId: 'user-1', gradeId: 'grade-a' }),
      makeInput({
        subjectId: 'user-2',
        gradeId: 'grade-b',
        performanceScore: 60,
        goalScore: 100,
        feedbackScore: 80,
      }),
    ])
    const gradeWeightProvider = makeGradeProvider({
      findGradeWeights: vi.fn().mockImplementation(async (gradeId: string) =>
        gradeId === 'grade-b'
          ? {
              gradeId,
              label: 'G4',
              performanceWeight: 0.2,
              goalWeight: 0.5,
              feedbackWeight: 0.3,
            }
          : {
              gradeId,
              label: 'G3',
              performanceWeight: 0.5,
              goalWeight: 0.3,
              feedbackWeight: 0.2,
            },
      ),
    })
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider,
      incentiveAdjustmentProvider: makeIncentives(),
    })

    const results = await svc.calculateAll('cycle-1')

    expect(results.map((r) => ({ subjectId: r.subjectId, finalScore: r.finalScore }))).toEqual([
      { subjectId: 'user-1', finalScore: 79 },
      { subjectId: 'user-2', finalScore: 86 },
    ])
    expect(gradeWeightProvider.findGradeWeights).toHaveBeenCalledWith('grade-a')
    expect(gradeWeightProvider.findGradeWeights).toHaveBeenCalledWith('grade-b')
  })
})

describe('TotalEvaluationService.previewBeforeFinalize', () => {
  it('確定前プレビューとして各社員の内訳を返す', async () => {
    const previewRows = [
      {
        id: 'ter-1',
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
        status: 'CALCULATED' as const,
        calculatedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ]
    const repo = makeRepo([])
    repo.listPreviewResults = vi.fn().mockResolvedValue(previewRows)
    const svc = createTotalEvaluationService({
      repository: repo,
      gradeWeightProvider: makeGradeProvider(),
      incentiveAdjustmentProvider: makeIncentives(),
    })

    await expect(svc.previewBeforeFinalize('cycle-1')).resolves.toEqual({
      cycleId: 'cycle-1',
      results: previewRows,
    })
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
