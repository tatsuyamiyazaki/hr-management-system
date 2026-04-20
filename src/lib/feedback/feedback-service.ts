/**
 * Issue #55 / Task 17.1, 17.3: FeedbackService 実装
 * Issue #63 / Task 17.4: 閲覧確認と公開後アーカイブ
 *
 * - CycleFinalized イベント購読で scheduleTransform を自動起動
 * - 被評価者単位の BullMQ ジョブ投入
 * - HR_MANAGER プレビュー・承認・公開（Req 10.4, 10.6）
 * - 被評価者の確認日時記録（Req 10.7）
 * - 公開から2年経過でアーカイブ化（Req 10.9）
 *
 * 関連要件: Req 10.1, 10.2, 10.4, 10.6, 10.7, 10.9
 */
import type { JobQueue } from '@/lib/jobs/job-queue'
import type { EvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus'
import type {
  FeedbackRepository,
  FeedbackResultRepository,
  FeedbackService,
  FeedbackPreview,
  PublishedFeedback,
} from './feedback-types'

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackServiceDeps {
  readonly jobQueue: JobQueue
  readonly feedbackRepository: FeedbackRepository
  readonly feedbackResultRepository: FeedbackResultRepository
  readonly eventBus?: EvaluationEventBus
  readonly clock?: () => Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class FeedbackNotFoundError extends Error {
  constructor(cycleId: string, subjectId: string) {
    super(`Feedback not found for cycleId="${cycleId}", subjectId="${subjectId}"`)
    this.name = 'FeedbackNotFoundError'
  }
}

export class FeedbackInvalidStatusError extends Error {
  constructor(expected: string, actual: string) {
    super(`Invalid feedback status: expected "${expected}", got "${actual}"`)
    this.name = 'FeedbackInvalidStatusError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class FeedbackServiceImpl implements FeedbackService {
  private readonly jobQueue: JobQueue
  private readonly feedbackRepository: FeedbackRepository
  private readonly feedbackResultRepository: FeedbackResultRepository
  private readonly clock: () => Date

  constructor(deps: FeedbackServiceDeps) {
    this.jobQueue = deps.jobQueue
    this.feedbackRepository = deps.feedbackRepository
    this.feedbackResultRepository = deps.feedbackResultRepository
    this.clock = deps.clock ?? (() => new Date())

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

  async previewTransformed(cycleId: string, subjectId: string): Promise<FeedbackPreview | null> {
    const result = await this.feedbackResultRepository.findByCycleAndSubject(cycleId, subjectId)
    if (!result) return null

    return {
      cycleId: result.cycleId,
      subjectId: result.subjectId,
      transformedBatch: result.transformedBatch,
      summary: result.summary,
      status: result.status,
    }
  }

  async approveAndPublish(cycleId: string, subjectId: string, approvedBy: string): Promise<void> {
    const result = await this.feedbackResultRepository.findByCycleAndSubject(cycleId, subjectId)
    if (!result) {
      throw new FeedbackNotFoundError(cycleId, subjectId)
    }

    if (result.status !== 'PENDING_HR_APPROVAL') {
      throw new FeedbackInvalidStatusError('PENDING_HR_APPROVAL', result.status)
    }

    const now = this.clock().toISOString()
    await this.feedbackResultRepository.updateStatus(cycleId, subjectId, {
      status: 'PUBLISHED',
      approvedBy,
      approvedAt: now,
      publishedAt: now,
    })
  }

  async getPublishedFor(subjectId: string): Promise<PublishedFeedback[]> {
    const results = await this.feedbackResultRepository.findPublishedBySubject(subjectId)

    return results
      .filter((r) => r.publishedAt != null)
      .map((r) => ({
        id: r.id,
        cycleId: r.cycleId,
        subjectId: r.subjectId,
        transformedBatch: [...r.transformedBatch],
        summary: r.summary,
        publishedAt: r.publishedAt!,
      }))
  }

  async recordView(cycleId: string, subjectId: string): Promise<void> {
    const result = await this.feedbackResultRepository.findByCycleAndSubject(cycleId, subjectId)
    if (!result) {
      throw new FeedbackNotFoundError(cycleId, subjectId)
    }
    if (result.status !== 'PUBLISHED' && result.status !== 'ARCHIVED') {
      throw new FeedbackInvalidStatusError('PUBLISHED or ARCHIVED', result.status)
    }
    await this.feedbackResultRepository.updateStatus(cycleId, subjectId, {
      viewedAt: this.clock().toISOString(),
    })
  }

  async archiveExpired(now: Date): Promise<{ archived: number }> {
    const twoYearsAgo = new Date(now)
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const threshold = twoYearsAgo.toISOString()

    const expired = await this.feedbackResultRepository.findPublishedBefore(threshold)
    const archivedAt = now.toISOString()

    for (const r of expired) {
      await this.feedbackResultRepository.updateStatus(r.cycleId, r.subjectId, {
        status: 'ARCHIVED',
        archivedAt,
      })
    }

    return { archived: expired.length }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createFeedbackService(deps: FeedbackServiceDeps): FeedbackService {
  return new FeedbackServiceImpl(deps)
}
