/**
 * Issue #63 / Task 17.4: FeedbackService 閲覧確認・アーカイブ 単体テスト
 * (Req 10.7, 10.9)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createFeedbackService,
  FeedbackNotFoundError,
  FeedbackInvalidStatusError,
} from '@/lib/feedback/feedback-service'
import type { FeedbackTransformResult } from '@/lib/feedback/feedback-types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-20T10:00:00.000Z')

function makeResult(overrides: Partial<FeedbackTransformResult> = {}): FeedbackTransformResult {
  return {
    id: 'fb-1',
    cycleId: 'cycle-1',
    subjectId: 'user-subject',
    rawCommentBatch: ['raw comment'],
    transformedBatch: ['transformed comment'],
    summary: 'summary text',
    status: 'PUBLISHED',
    publishedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeDeps(opts: {
  findResult?: FeedbackTransformResult | null
  findPublishedBefore?: FeedbackTransformResult[]
}) {
  const { findResult = makeResult(), findPublishedBefore = [] } = opts

  const feedbackResultRepository = {
    save: vi.fn(),
    findByCycleAndSubject: vi.fn().mockResolvedValue(findResult),
    findByCycleId: vi.fn().mockResolvedValue([]),
    findPublishedBySubject: vi.fn().mockResolvedValue([]),
    findPublishedBefore: vi.fn().mockResolvedValue(findPublishedBefore),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  }

  return {
    jobQueue: { enqueue: vi.fn() },
    feedbackRepository: {
      findSubjectsByCycleId: vi.fn().mockResolvedValue([]),
      findRawComments: vi.fn().mockResolvedValue([]),
    },
    feedbackResultRepository,
    clock: () => FIXED_NOW,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// recordView (Req 10.7)
// ─────────────────────────────────────────────────────────────────────────────

describe('FeedbackService.recordView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('PUBLISHED フィードバックの viewedAt を記録する', async () => {
    const deps = makeDeps({ findResult: makeResult({ status: 'PUBLISHED' }) })
    const svc = createFeedbackService(deps)

    await svc.recordView('cycle-1', 'user-subject')

    expect(deps.feedbackResultRepository.updateStatus).toHaveBeenCalledWith(
      'cycle-1',
      'user-subject',
      { viewedAt: FIXED_NOW.toISOString() },
    )
  })

  it('ARCHIVED フィードバックでも viewedAt を記録できる', async () => {
    const deps = makeDeps({ findResult: makeResult({ status: 'ARCHIVED' }) })
    const svc = createFeedbackService(deps)

    await svc.recordView('cycle-1', 'user-subject')

    expect(deps.feedbackResultRepository.updateStatus).toHaveBeenCalledWith(
      'cycle-1',
      'user-subject',
      { viewedAt: FIXED_NOW.toISOString() },
    )
  })

  it('フィードバックが存在しない場合 FeedbackNotFoundError をスローする', async () => {
    const deps = makeDeps({ findResult: null })
    const svc = createFeedbackService(deps)

    await expect(svc.recordView('cycle-1', 'user-subject')).rejects.toBeInstanceOf(
      FeedbackNotFoundError,
    )
  })

  it('PENDING_HR_APPROVAL 状態では FeedbackInvalidStatusError をスローする', async () => {
    const deps = makeDeps({ findResult: makeResult({ status: 'PENDING_HR_APPROVAL' }) })
    const svc = createFeedbackService(deps)

    await expect(svc.recordView('cycle-1', 'user-subject')).rejects.toBeInstanceOf(
      FeedbackInvalidStatusError,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// archiveExpired (Req 10.9)
// ─────────────────────────────────────────────────────────────────────────────

describe('FeedbackService.archiveExpired', () => {
  beforeEach(() => vi.clearAllMocks())

  it('対象フィードバックがない場合は archived=0 を返す', async () => {
    const deps = makeDeps({ findPublishedBefore: [] })
    const svc = createFeedbackService(deps)

    const result = await svc.archiveExpired(FIXED_NOW)

    expect(result).toEqual({ archived: 0 })
    expect(deps.feedbackResultRepository.updateStatus).not.toHaveBeenCalled()
  })

  it('2年以上前に公開されたフィードバックを ARCHIVED に変更する', async () => {
    const expired = [
      makeResult({ cycleId: 'cycle-1', subjectId: 'user-1', publishedAt: '2020-01-01T00:00:00Z' }),
      makeResult({ cycleId: 'cycle-2', subjectId: 'user-2', publishedAt: '2021-06-01T00:00:00Z' }),
    ]
    const deps = makeDeps({ findPublishedBefore: expired })
    const svc = createFeedbackService(deps)

    const result = await svc.archiveExpired(FIXED_NOW)

    expect(result).toEqual({ archived: 2 })
    expect(deps.feedbackResultRepository.updateStatus).toHaveBeenCalledTimes(2)
    expect(deps.feedbackResultRepository.updateStatus).toHaveBeenCalledWith('cycle-1', 'user-1', {
      status: 'ARCHIVED',
      archivedAt: FIXED_NOW.toISOString(),
    })
  })

  it('findPublishedBefore に2年前の閾値 ISO 文字列を渡す', async () => {
    const deps = makeDeps({ findPublishedBefore: [] })
    const svc = createFeedbackService(deps)

    await svc.archiveExpired(FIXED_NOW)

    // FIXED_NOW = 2026-04-20T10:00:00Z → 2年前 = 2024-04-20T10:00:00Z
    const expectedThreshold = new Date('2024-04-20T10:00:00.000Z').toISOString()
    expect(deps.feedbackResultRepository.findPublishedBefore).toHaveBeenCalledWith(
      expectedThreshold,
    )
  })
})
