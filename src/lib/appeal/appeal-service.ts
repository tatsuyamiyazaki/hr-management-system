import type {
  AppealAuditLogger,
  Appeal,
  AppealInput,
  AppealNotificationPort,
  AppealRecalculationPort,
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
  readonly recalculationPort?: AppealRecalculationPort
  readonly auditLogger?: AppealAuditLogger
  readonly clock?: () => Date
}

function computeDeadline(publishedAt: Date): Date {
  return new Date(publishedAt.getTime() + APPEAL_WINDOW_DAYS * MS_PER_DAY)
}

function computeRetentionUntil(submittedAt: Date): Date {
  const retention = new Date(submittedAt)
  retention.setFullYear(retention.getFullYear() + 7)
  return retention
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
  private readonly recalculationPort?: AppealRecalculationPort
  private readonly auditLogger?: AppealAuditLogger
  private readonly clock: () => Date

  constructor(deps: AppealServiceDeps) {
    this.repository = deps.repository
    this.notificationEmitter = deps.notificationEmitter
    this.recalculationPort = deps.recalculationPort
    this.auditLogger = deps.auditLogger
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

    const now = this.clock()
    assertWithinDeadline(target, this.clock())

    const appeal = await this.repository.createAppeal({
      appellantId,
      cycleId: target.cycleId,
      subjectId: target.subjectId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      desiredOutcome: input.desiredOutcome?.trim() || null,
      retainedUntil: computeRetentionUntil(now),
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

    const reviewTime = this.clock()
    const recalculationRequestedAt =
      input.status === 'ACCEPTED' ? reviewTime : appeal.recalculationRequestedAt

    const reviewedAppeal = await this.repository.updateAppealReview(appealId, {
      status: input.status,
      reviewerId: hrManagerId,
      reviewComment: input.reviewComment.trim(),
      reviewedAt: reviewTime,
      recalculationRequestedAt,
    })

    if (input.status === 'ACCEPTED' && this.recalculationPort) {
      await this.recalculationPort.recalculate({
        appealId: reviewedAppeal.id,
        cycleId: reviewedAppeal.cycleId,
        subjectId: reviewedAppeal.subjectId,
        triggeredBy: hrManagerId,
      })
    }

    if (input.status === 'ACCEPTED' && this.auditLogger) {
      await this.auditLogger.emit({
        userId: hrManagerId,
        action: 'RECORD_UPDATE',
        resourceType: 'EVALUATION',
        resourceId: reviewedAppeal.subjectId,
        before: {
          appealId: appeal.id,
          status: appeal.status,
          recalculationRequestedAt: appeal.recalculationRequestedAt?.toISOString() ?? null,
        },
        after: {
          appealId: reviewedAppeal.id,
          status: reviewedAppeal.status,
          recalculationRequestedAt: reviewedAppeal.recalculationRequestedAt?.toISOString() ?? null,
          retainedUntil: reviewedAppeal.retainedUntil.toISOString(),
        },
      })
    }

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
