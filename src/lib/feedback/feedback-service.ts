/**
 * Issue #55 / Task 17.1: FeedbackService 実装
 *
 * - CycleFinalized イベント購読で scheduleTransform を自動起動
 * - 被評価者単位の BullMQ ジョブ投入
 *
 * 関連要件: Req 10.1, 10.2
 */
import type { JobQueue } from '@/lib/jobs/job-queue'
import type { EvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus'
import type { FeedbackRepository, FeedbackService } from './feedback-types'

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackServiceDeps {
  readonly jobQueue: JobQueue
  readonly feedbackRepository: FeedbackRepository
  readonly eventBus?: EvaluationEventBus
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class FeedbackServiceImpl implements FeedbackService {
  private readonly jobQueue: JobQueue
  private readonly feedbackRepository: FeedbackRepository

  constructor(deps: FeedbackServiceDeps) {
    this.jobQueue = deps.jobQueue
    this.feedbackRepository = deps.feedbackRepository

    // CycleFinalized イベント購読
    if (deps.eventBus) {
      deps.eventBus.subscribe('CycleFinalized', async (payload) => {
        await this.scheduleTransform(payload.cycleId)
      })
    }
  }

  async scheduleTransform(cycleId: string): Promise<void> {
    const subjects = await this.feedbackRepository.findSubjectsByCycleId(cycleId)

    for (const subjectId of subjects) {
      await this.jobQueue.enqueue('feedback-transform', { cycleId, subjectId })
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createFeedbackService(deps: FeedbackServiceDeps): FeedbackService {
  return new FeedbackServiceImpl(deps)
}
