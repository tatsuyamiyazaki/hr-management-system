import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppealService } from '@/lib/appeal/appeal-service'
import type {
  AppealAuditLogger,
  Appeal,
  AppealNotificationPort,
  AppealRecalculationPort,
  AppealRepository,
  AppealableTarget,
} from '@/lib/appeal/appeal-types'
import {
  AppealDeadlineExceededError,
  AppealInvalidStatusTransitionError,
  AppealNotFoundError,
  AppealTargetNotFoundError,
} from '@/lib/appeal/appeal-types'

function makeTarget(overrides: Partial<AppealableTarget> = {}): AppealableTarget {
  return {
    cycleId: 'cycle-1',
    subjectId: 'emp-1',
    targetId: 'target-1',
    publishedAt: new Date('2026-04-10T00:00:00.000Z'),
    ...overrides,
  }
}

function makeAppeal(overrides: Partial<Appeal> = {}): Appeal {
  return {
    id: 'appeal-1',
    appellantId: 'emp-1',
    cycleId: 'cycle-1',
    subjectId: 'emp-1',
    targetType: 'FEEDBACK',
    targetId: 'target-1',
    reason: '評価内容に差異があります',
    desiredOutcome: '再確認してほしい',
    status: 'SUBMITTED',
    reviewerId: null,
    reviewComment: null,
    reviewedAt: null,
    submittedAt: new Date('2026-04-12T00:00:00.000Z'),
    retainedUntil: new Date('2033-04-12T00:00:00.000Z'),
    recalculationRequestedAt: null,
    ...overrides,
  }
}

function makeRepository(): AppealRepository {
  return {
    createAppeal: vi.fn().mockImplementation(async (input) =>
      makeAppeal({
        appellantId: input.appellantId,
        cycleId: input.cycleId,
        subjectId: input.subjectId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        desiredOutcome: input.desiredOutcome,
      }),
    ),
    findPublishedFeedbackTarget: vi.fn().mockResolvedValue(makeTarget()),
    findFinalizedTotalEvaluationTarget: vi.fn().mockResolvedValue(makeTarget()),
    listHrManagerIds: vi.fn().mockResolvedValue(['hr-1', 'hr-2']),
    listAppeals: vi.fn().mockResolvedValue([]),
    findAppealById: vi.fn().mockResolvedValue(makeAppeal()),
    updateAppealReview: vi.fn().mockImplementation(async (appealId, input) =>
      makeAppeal({
        id: appealId,
        status: input.status,
        reviewerId: input.reviewerId,
        reviewComment: input.reviewComment,
        reviewedAt: input.reviewedAt,
      }),
    ),
  }
}

describe('AppealService.submitAppeal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('公開済みフィードバックへの異議申立てを保存し HR_MANAGER に通知する', async () => {
    const repository = makeRepository()
    const notificationEmitter: AppealNotificationPort = {
      emit: vi.fn().mockResolvedValue(undefined),
    }
    const service = createAppealService({
      repository,
      notificationEmitter,
      clock: () => new Date('2026-04-20T00:00:00.000Z'),
    })

    const result = await service.submitAppeal('emp-1', {
      targetType: 'FEEDBACK',
      targetId: 'feedback-1',
      reason: '評価内容に差異があります',
      desiredOutcome: '再確認してほしい',
    })

    expect(repository.findPublishedFeedbackTarget).toHaveBeenCalledWith('feedback-1', 'emp-1')
    expect(repository.createAppeal).toHaveBeenCalledWith({
      appellantId: 'emp-1',
      cycleId: 'cycle-1',
      subjectId: 'emp-1',
      targetType: 'FEEDBACK',
      targetId: 'feedback-1',
      reason: '評価内容に差異があります',
      desiredOutcome: '再確認してほしい',
      retainedUntil: new Date('2033-04-20T00:00:00.000Z'),
    })
    expect(notificationEmitter.emit).toHaveBeenCalledTimes(2)
    expect(result).toEqual(
      expect.objectContaining({
        appellantId: 'emp-1',
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
      }),
    )
  })

  it('公開日から14日を超えた場合は期限超過エラー', async () => {
    const repository = makeRepository()
    repository.findPublishedFeedbackTarget = vi.fn().mockResolvedValue(
      makeTarget({
        publishedAt: new Date('2026-04-01T00:00:00.000Z'),
      }),
    )
    const service = createAppealService({
      repository,
      clock: () => new Date('2026-04-20T00:00:01.000Z'),
    })

    await expect(
      service.submitAppeal('emp-1', {
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '期限切れ',
      }),
    ).rejects.toBeInstanceOf(AppealDeadlineExceededError)
  })

  it('対象が見つからない場合は not found エラー', async () => {
    const repository = makeRepository()
    repository.findFinalizedTotalEvaluationTarget = vi.fn().mockResolvedValue(null)
    const service = createAppealService({
      repository,
      clock: () => new Date('2026-04-20T00:00:00.000Z'),
    })

    await expect(
      service.submitAppeal('emp-1', {
        targetType: 'TOTAL_EVALUATION',
        targetId: 'result-1',
        reason: '総合評価を再確認したい',
      }),
    ).rejects.toBeInstanceOf(AppealTargetNotFoundError)
  })
})

describe('AppealService.listPending', () => {
  it('未対応案件を優先して返す', async () => {
    const repository = makeRepository()
    repository.listAppeals = vi.fn().mockResolvedValue([
      makeAppeal({
        id: 'appeal-accepted',
        status: 'ACCEPTED',
        submittedAt: new Date('2026-04-10T00:00:00.000Z'),
      }),
      makeAppeal({
        id: 'appeal-review',
        status: 'UNDER_REVIEW',
        submittedAt: new Date('2026-04-20T00:00:00.000Z'),
      }),
      makeAppeal({
        id: 'appeal-submitted',
        status: 'SUBMITTED',
        submittedAt: new Date('2026-04-21T00:00:00.000Z'),
      }),
    ])
    const service = createAppealService({ repository })

    const result = await service.listPending('hr-1')

    expect(result.map((appeal) => appeal.id)).toEqual([
      'appeal-submitted',
      'appeal-review',
      'appeal-accepted',
    ])
  })
})

describe('AppealService.review', () => {
  it('SUBMITTED を UNDER_REVIEW に更新し申立者へ通知する', async () => {
    const repository = makeRepository()
    repository.findAppealById = vi.fn().mockResolvedValue(
      makeAppeal({
        id: 'appeal-1',
        status: 'SUBMITTED',
      }),
    )
    const notificationEmitter: AppealNotificationPort = {
      emit: vi.fn().mockResolvedValue(undefined),
    }
    const service = createAppealService({
      repository,
      notificationEmitter,
      clock: () => new Date('2026-04-21T00:00:00.000Z'),
    })

    const result = await service.review('hr-1', 'appeal-1', {
      status: 'UNDER_REVIEW',
      reviewComment: '確認を開始しました',
    })

    expect(repository.updateAppealReview).toHaveBeenCalledWith('appeal-1', {
      status: 'UNDER_REVIEW',
      reviewerId: 'hr-1',
      reviewComment: '確認を開始しました',
      reviewedAt: new Date('2026-04-21T00:00:00.000Z'),
      recalculationRequestedAt: null,
    })
    expect(notificationEmitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'emp-1',
        category: 'SYSTEM',
      }),
    )
    expect(result.status).toBe('UNDER_REVIEW')
  })

  it('ACCEPTED のとき再計算と監査ログを起動する', async () => {
    const repository = makeRepository()
    repository.findAppealById = vi.fn().mockResolvedValue(
      makeAppeal({
        id: 'appeal-accepted',
        status: 'UNDER_REVIEW',
        targetType: 'TOTAL_EVALUATION',
        targetId: 'result-1',
      }),
    )
    repository.updateAppealReview = vi.fn().mockImplementation(async (appealId, input) =>
      makeAppeal({
        id: appealId,
        status: input.status,
        reviewerId: input.reviewerId,
        reviewComment: input.reviewComment,
        reviewedAt: input.reviewedAt,
        recalculationRequestedAt: input.recalculationRequestedAt ?? null,
        targetType: 'TOTAL_EVALUATION',
        targetId: 'result-1',
      }),
    )
    const recalculationPort: AppealRecalculationPort = {
      recalculate: vi.fn().mockResolvedValue(undefined),
    }
    const auditLogger: AppealAuditLogger = {
      emit: vi.fn().mockResolvedValue(undefined),
    }
    const service = createAppealService({
      repository,
      recalculationPort,
      auditLogger,
      clock: () => new Date('2026-04-21T00:00:00.000Z'),
    })

    const result = await service.review('hr-1', 'appeal-accepted', {
      status: 'ACCEPTED',
      reviewComment: '認容して再計算します',
    })

    expect(recalculationPort.recalculate).toHaveBeenCalledWith({
      appealId: 'appeal-accepted',
      cycleId: 'cycle-1',
      subjectId: 'emp-1',
      triggeredBy: 'hr-1',
    })
    expect(auditLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'hr-1',
        action: 'RECORD_UPDATE',
        resourceType: 'EVALUATION',
        resourceId: 'emp-1',
      }),
    )
    expect(result.recalculationRequestedAt).toEqual(new Date('2026-04-21T00:00:00.000Z'))
  })

  it('存在しない異議申立ては not found', async () => {
    const repository = makeRepository()
    repository.findAppealById = vi.fn().mockResolvedValue(null)
    const service = createAppealService({ repository })

    await expect(
      service.review('hr-1', 'appeal-missing', {
        status: 'UNDER_REVIEW',
        reviewComment: '確認開始',
      }),
    ).rejects.toBeInstanceOf(AppealNotFoundError)
  })

  it('不正な遷移は弾く', async () => {
    const repository = makeRepository()
    repository.findAppealById = vi.fn().mockResolvedValue(
      makeAppeal({
        id: 'appeal-1',
        status: 'SUBMITTED',
      }),
    )
    const service = createAppealService({ repository })

    await expect(
      service.review('hr-1', 'appeal-1', {
        status: 'ACCEPTED',
        reviewComment: 'いきなり認容',
      }),
    ).rejects.toBeInstanceOf(AppealInvalidStatusTransitionError)
  })
})
