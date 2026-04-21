import type {
  Appeal,
  AppealInput,
  AppealNotificationPort,
  AppealRepository,
  AppealService,
  AppealableTarget,
} from './appeal-types'
import { AppealDeadlineExceededError, AppealTargetNotFoundError } from './appeal-types'

const APPEAL_WINDOW_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

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
}

export function createAppealService(deps: AppealServiceDeps): AppealService {
  return new AppealServiceImpl(deps)
}
