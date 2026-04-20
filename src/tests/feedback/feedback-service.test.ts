/**
 * Issue #55 / Task 17.1: FeedbackService 単体テスト
 *
 * - CycleFinalized 購読で scheduleTransform が呼ばれる
 * - 被評価者単位で BullMQ ジョブが投入される
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFeedbackService } from '@/lib/feedback/feedback-service'
import type { FeedbackRepository } from '@/lib/feedback/feedback-types'
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
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo })

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
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo })

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
    const eventBus = new InMemoryEvaluationEventBus()

    createFeedbackService({ jobQueue, feedbackRepository: repo, eventBus })

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
    const svc = createFeedbackService({ jobQueue, feedbackRepository: repo })

    await svc.scheduleTransform('cycle-5')

    expect(jobQueue.enqueue).toHaveBeenCalledWith('feedback-transform', {
      cycleId: 'cycle-5',
      subjectId: 'user-x',
    })
  })
})
