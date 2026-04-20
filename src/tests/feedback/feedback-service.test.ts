/**
 * Issue #55 / Task 17.1, 17.3: FeedbackService 単体テスト
 *
 * - CycleFinalized 購読で scheduleTransform が呼ばれる
 * - 被評価者単位で BullMQ ジョブが投入される
 * - HR_MANAGER プレビュー・承認・公開
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFeedbackService, FeedbackNotFoundError, FeedbackInvalidStatusError } from '@/lib/feedback/feedback-service'
import type { FeedbackRepository, FeedbackResultRepository, FeedbackTransformResult } from '@/lib/feedback/feedback-types'
import type { JobQueue } from '@/lib/jobs/job-queue'
import { InMemoryEvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus'

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockJobQueue(): JobQueue {
  return {
    enqueue: vi.fn().mockResolvedValue('job-1'),
    getJobStatus: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function makeMockFeedbackRepository(subjects: string[] = []): FeedbackRepository {
  return {
    findSubjectsByCycleId: vi.fn().mockResolvedValue(subjects),
    findRawComments: vi.fn().mockResolvedValue([]),
  }
}

function makeMockFeedbackResultRepository(
  data: FeedbackTransformResult[] = [],
): FeedbackResultRepository {
  const store = [...data]
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findByCycleAndSubject: vi.fn().mockImplementation((cycleId: string, subjectId: string) => {
      return Promise.resolve(
        store.find((r) => r.cycleId === cycleId && r.subjectId === subjectId) ?? null,
      )
    }),
    findByCycleId: vi.fn().mockImplementation((cycleId: string) => {
      return Promise.resolve(store.filter((r) => r.cycleId === cycleId))
    }),
    findPublishedBySubject: vi.fn().mockImplementation((subjectId: string) => {
      return Promise.resolve(
        store.filter((r) => r.subjectId === subjectId && r.status === 'PUBLISHED'),
      )
    }),
    updateStatus: vi.fn().mockImplementation((cycleId: string, subjectId: string, update: Partial<FeedbackTransformResult>) => {
      const idx = store.findIndex((r) => r.cycleId === cycleId && r.subjectId === subjectId)
      if (idx >= 0) {
        store[idx] = { ...store[idx]!, ...update }
      }
      return Promise.resolve()
    }),
  }
}

function makeSampleTransformResult(
  overrides: Partial<FeedbackTransformResult> = {},
): FeedbackTransformResult {
  return {
    id: 'ftr-1',
    cycleId: 'cycle-1',
    subjectId: 'user-1',
    rawCommentBatch: ['raw comment 1'],
    transformedBatch: ['transformed comment 1'],
    summary: 'Summary of feedback',
    status: 'PENDING_HR_APPROVAL',
    ...overrides,
  }
}

const FIXED_NOW = new Date('2025-01-15T10:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// scheduleTransform
// ─────────────────────────────────────────────────────────────────────────────

describe('FeedbackService.scheduleTransform', () => {
  it('被評価者単位で feedback-transform ジョブを投入する', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository(['user-1', 'user-2', 'user-3'])
    const resultRepo = makeMockFeedbackResultRepository()
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    await svc.scheduleTransform('cycle-1')

    expect(repo.findSubjectsByCycleId).toHaveBeenCalledWith('cycle-1')
    expect(jobQueue.enqueue).toHaveBeenCalledTimes(3)
    expect(jobQueue.enqueue).toHaveBeenCalledWith('feedback-transform', {
      cycleId: 'cycle-1',
      subjectId: 'user-1',
    })
    expect(jobQueue.enqueue).toHaveBeenCalledWith('feedback-transform', {
      cycleId: 'cycle-1',
      subjectId: 'user-2',
    })
    expect(jobQueue.enqueue).toHaveBeenCalledWith('feedback-transform', {
      cycleId: 'cycle-1',
      subjectId: 'user-3',
    })
  })

  it('被評価者がいない場合はジョブを投入しない', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository([])
    const resultRepo = makeMockFeedbackResultRepository()
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    await svc.scheduleTransform('cycle-1')

    expect(jobQueue.enqueue).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CycleFinalized イベント購読
// ─────────────────────────────────────────────────────────────────────────────

describe('FeedbackService CycleFinalized 購読', () => {
  it('CycleFinalized イベントで scheduleTransform が自動実行される', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository(['user-a', 'user-b'])
    const resultRepo = makeMockFeedbackResultRepository()
    const eventBus = new InMemoryEvaluationEventBus()

    createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo, eventBus })

    // Act: CycleFinalized イベントを publish
    await eventBus.publish('CycleFinalized', {
      cycleId: 'cycle-99',
      cycleName: '2024 Q4',
      finalizedAt: '2024-12-31T23:59:59.000Z',
    })

    // Assert: 被評価者2名分のジョブが投入されている
    expect(repo.findSubjectsByCycleId).toHaveBeenCalledWith('cycle-99')
    expect(jobQueue.enqueue).toHaveBeenCalledTimes(2)
    expect(jobQueue.enqueue).toHaveBeenCalledWith('feedback-transform', {
      cycleId: 'cycle-99',
      subjectId: 'user-a',
    })
    expect(jobQueue.enqueue).toHaveBeenCalledWith('feedback-transform', {
      cycleId: 'cycle-99',
      subjectId: 'user-b',
    })
  })

  it('eventBus が未指定の場合でも scheduleTransform は直接呼び出し可能', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository(['user-x'])
    const resultRepo = makeMockFeedbackResultRepository()
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    await svc.scheduleTransform('cycle-5')

    expect(jobQueue.enqueue).toHaveBeenCalledWith('feedback-transform', {
      cycleId: 'cycle-5',
      subjectId: 'user-x',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// previewTransformed (Req 10.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('FeedbackService.previewTransformed', () => {
  it('変換結果が存在する場合、プレビューを返す', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository()
    const sample = makeSampleTransformResult()
    const resultRepo = makeMockFeedbackResultRepository([sample])
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    const preview = await svc.previewTransformed('cycle-1', 'user-1')

    expect(preview).toEqual({
      cycleId: 'cycle-1',
      subjectId: 'user-1',
      transformedBatch: ['transformed comment 1'],
      summary: 'Summary of feedback',
      status: 'PENDING_HR_APPROVAL',
    })
  })

  it('変換結果が存在しない場合、null を返す', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository()
    const resultRepo = makeMockFeedbackResultRepository()
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    const preview = await svc.previewTransformed('cycle-1', 'user-1')

    expect(preview).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// approveAndPublish (Req 10.4, 10.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('FeedbackService.approveAndPublish', () => {
  it('PENDING_HR_APPROVAL の結果を PUBLISHED に遷移する', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository()
    const sample = makeSampleTransformResult({ status: 'PENDING_HR_APPROVAL' })
    const resultRepo = makeMockFeedbackResultRepository([sample])
    const svc = createFeedbackService({
      jobQueue,
      feedbackRepository: repo,
      feedbackResultRepository: resultRepo,
      clock: () => FIXED_NOW,
    })

    await svc.approveAndPublish('cycle-1', 'user-1', 'hr-mgr-1')

    expect(resultRepo.updateStatus).toHaveBeenCalledWith('cycle-1', 'user-1', {
      status: 'PUBLISHED',
      approvedBy: 'hr-mgr-1',
      approvedAt: FIXED_NOW.toISOString(),
      publishedAt: FIXED_NOW.toISOString(),
    })
  })

  it('変換結果が存在しない場合、FeedbackNotFoundError をスローする', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository()
    const resultRepo = makeMockFeedbackResultRepository()
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    await expect(svc.approveAndPublish('cycle-1', 'user-1', 'hr-mgr-1')).rejects.toThrow(
      FeedbackNotFoundError,
    )
  })

  it('ステータスが PENDING_HR_APPROVAL でない場合、FeedbackInvalidStatusError をスローする', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository()
    const sample = makeSampleTransformResult({ status: 'PUBLISHED' })
    const resultRepo = makeMockFeedbackResultRepository([sample])
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    await expect(svc.approveAndPublish('cycle-1', 'user-1', 'hr-mgr-1')).rejects.toThrow(
      FeedbackInvalidStatusError,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getPublishedFor (Req 10.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('FeedbackService.getPublishedFor', () => {
  it('公開済みフィードバックを匿名 DTO として返す（evaluatorId なし）', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository()
    const published = makeSampleTransformResult({
      status: 'PUBLISHED',
      publishedAt: '2025-01-15T10:00:00.000Z',
    })
    const resultRepo = makeMockFeedbackResultRepository([published])
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    const results = await svc.getPublishedFor('user-1')

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 'ftr-1',
      cycleId: 'cycle-1',
      subjectId: 'user-1',
      transformedBatch: ['transformed comment 1'],
      summary: 'Summary of feedback',
      publishedAt: '2025-01-15T10:00:00.000Z',
    })
    // evaluatorId が含まれていないことを確認（匿名性保証）
    expect(results[0]).not.toHaveProperty('rawCommentBatch')
    expect(results[0]).not.toHaveProperty('approvedBy')
  })

  it('公開済みフィードバックが存在しない場合、空配列を返す', async () => {
    const jobQueue = makeMockJobQueue()
    const repo = makeMockFeedbackRepository()
    const resultRepo = makeMockFeedbackResultRepository()
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo, feedbackResultRepository: resultRepo })

    const results = await svc.getPublishedFor('user-1')

    expect(results).toEqual([])
  })
})
