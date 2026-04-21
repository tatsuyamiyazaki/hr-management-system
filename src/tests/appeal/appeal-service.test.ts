import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppealService } from '@/lib/appeal/appeal-service'
import type {
  Appeal,
  AppealNotificationPort,
  AppealRepository,
  AppealableTarget,
} from '@/lib/appeal/appeal-types'
import { AppealDeadlineExceededError, AppealTargetNotFoundError } from '@/lib/appeal/appeal-types'

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
    reason: '内容に事実誤認があります',
    desiredOutcome: '再確認してほしい',
    status: 'SUBMITTED',
    reviewerId: null,
    reviewComment: null,
    reviewedAt: null,
    submittedAt: new Date('2026-04-12T00:00:00.000Z'),
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
      reason: '内容に事実誤認があります',
      desiredOutcome: '再確認してほしい',
    })

    expect(repository.findPublishedFeedbackTarget).toHaveBeenCalledWith('feedback-1', 'emp-1')
    expect(repository.createAppeal).toHaveBeenCalledWith({
      appellantId: 'emp-1',
      cycleId: 'cycle-1',
      subjectId: 'emp-1',
      targetType: 'FEEDBACK',
      targetId: 'feedback-1',
      reason: '内容に事実誤認があります',
      desiredOutcome: '再確認してほしい',
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
        reason: '期限切れ確認',
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
        reason: '総合評価の根拠を確認したい',
      }),
    ).rejects.toBeInstanceOf(AppealTargetNotFoundError)
  })
})
