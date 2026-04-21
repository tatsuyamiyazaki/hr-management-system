import type {
  Appeal,
  AppealInput,
  AppealNotificationPort,
  AppealRepository,
  AppealReviewInput,
  AppealService,
  AppealStatus,
  AppealableTarget,
} from './appeal-types'
import {
  AppealDeadlineExceededError,
  AppealInvalidStatusTransitionError,
  AppealNotFoundError,
  AppealTargetNotFoundError,
} from './appeal-types'

const APPEAL_WINDOW_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000
const UNRESOLVED_PRIORITY: Record<AppealStatus, number> = {
  SUBMITTED: 0,
  UNDER_REVIEW: 1,
  ACCEPTED: 2,
  REJECTED: 3,
  WITHDRAWN: 4,
}
const ALLOWED_REVIEW_TRANSITIONS: Record<AppealStatus, readonly AppealReviewInput['status'][]> = {
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
}

export interface AppealServiceDeps {
  readonly repository: AppealRepository
  readonly notificationEmitter?: AppealNotificationPort
  readonly clock?: () => Date
}

function computeDeadline(publishedAt: Date): Date {
  return new Date(publishedAt.getTime() + APPEAL_WINDOW_DAYS * MS_PER_DAY)
}

function assertWithinDeadline(target: AppealableTarget, now: Date): void {
  const deadline = computeDeadline(target.publishedAt)
  if (now.getTime() > deadline.getTime()) {
    throw new AppealDeadlineExceededError(deadline)
  }
}

function assertReviewTransition(current: AppealStatus, next: AppealReviewInput['status']): void {
  const allowed = ALLOWED_REVIEW_TRANSITIONS[current]
  if (!allowed.includes(next)) {
    throw new AppealInvalidStatusTransitionError(current, next)
  }
}

function sortAppealsForReview(left: Appeal, right: Appeal): number {
  const priorityGap = UNRESOLVED_PRIORITY[left.status] - UNRESOLVED_PRIORITY[right.status]
  if (priorityGap !== 0) return priorityGap
  return right.submittedAt.getTime() - left.submittedAt.getTime()
}

class AppealServiceImpl implements AppealService {
  private readonly repository: AppealRepository
  private readonly notificationEmitter?: AppealNotificationPort
  private readonly clock: () => Date

  constructor(deps: AppealServiceDeps) {
    this.repository = deps.repository
    this.notificationEmitter = deps.notificationEmitter
    this.clock = deps.clock ?? (() => new Date())
  }

  async submitAppeal(appellantId: string, input: AppealInput): Promise<Appeal> {
    const target =
      input.targetType === 'FEEDBACK'
        ? await this.repository.findPublishedFeedbackTarget(input.targetId, appellantId)
        : await this.repository.findFinalizedTotalEvaluationTarget(input.targetId, appellantId)

    if (!target) {
      throw new AppealTargetNotFoundError(input.targetType, input.targetId)
    }

    assertWithinDeadline(target, this.clock())

    const appeal = await this.repository.createAppeal({
      appellantId,
      cycleId: target.cycleId,
      subjectId: target.subjectId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      desiredOutcome: input.desiredOutcome?.trim() || null,
    })

    const hrManagerIds = await this.repository.listHrManagerIds()
    if (this.notificationEmitter) {
      await Promise.all(
        hrManagerIds.map((userId) =>
          this.notificationEmitter!.emit({
            userId,
            category: 'SYSTEM',
            title: '異議申立てが届きました',
            body: `評価サイクル ${target.cycleId} の異議申立てが送信されました。`,
            payload: {
              appealId: appeal.id,
              cycleId: appeal.cycleId,
              subjectId: appeal.subjectId,
              targetType: appeal.targetType,
              targetId: appeal.targetId,
            },
          }),
        ),
      )
    }

    return appeal
  }

  async listPending(_hrManagerId: string): Promise<Appeal[]> {
    const appeals = await this.repository.listAppeals()
    return [...appeals].sort(sortAppealsForReview)
  }

  async review(hrManagerId: string, appealId: string, input: AppealReviewInput): Promise<Appeal> {
    const appeal = await this.repository.findAppealById(appealId)
    if (!appeal) {
      throw new AppealNotFoundError(appealId)
    }

    assertReviewTransition(appeal.status, input.status)

    const reviewedAppeal = await this.repository.updateAppealReview(appealId, {
      status: input.status,
      reviewerId: hrManagerId,
      reviewComment: input.reviewComment.trim(),
      reviewedAt: this.clock(),
    })

    if (this.notificationEmitter) {
      await this.notificationEmitter.emit({
        userId: reviewedAppeal.appellantId,
        category: 'SYSTEM',
        title: '異議申立ての審査ステータスが更新されました',
        body: `異議申立てのステータスが ${reviewedAppeal.status} に更新されました。`,
        payload: {
          appealId: reviewedAppeal.id,
          status: reviewedAppeal.status,
          reviewComment: reviewedAppeal.reviewComment,
        },
      })
    }

    return reviewedAppeal
  }
}

export function createAppealService(deps: AppealServiceDeps): AppealService {
  return new AppealServiceImpl(deps)
}
