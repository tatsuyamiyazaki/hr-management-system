import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  clearAppealServiceForTesting,
  setAppealServiceForTesting,
} from '@/lib/appeal/appeal-service-di'
import type { AppealService } from '@/lib/appeal/appeal-types'
import {
  AppealDeadlineExceededError,
  AppealInvalidStatusTransitionError,
  AppealNotFoundError,
  AppealTargetNotFoundError,
} from '@/lib/appeal/appeal-types'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET, POST } = await import('@/app/api/appeals/route')
const { PATCH } = await import('@/app/api/appeals/[appealId]/route')

function makeSession(role: string, userId = 'user-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/appeals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchRequest(appealId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/appeals/${appealId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeService(overrides?: Partial<AppealService>): AppealService {
  return {
    submitAppeal: vi.fn().mockResolvedValue({
      id: 'appeal-1',
      appellantId: 'emp-1',
      cycleId: 'cycle-1',
      subjectId: 'emp-1',
      targetType: 'FEEDBACK',
      targetId: 'feedback-1',
      reason: '評価内容に差異があります',
      desiredOutcome: '再確認してほしい',
      status: 'SUBMITTED',
      reviewerId: null,
      reviewComment: null,
      reviewedAt: null,
      submittedAt: new Date('2026-04-20T00:00:00.000Z'),
    }),
    listPending: vi.fn().mockResolvedValue([
      {
        id: 'appeal-1',
        appellantId: 'emp-1',
        cycleId: 'cycle-1',
        subjectId: 'emp-1',
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '理由',
        desiredOutcome: '再確認',
        status: 'SUBMITTED',
        reviewerId: null,
        reviewComment: null,
        reviewedAt: null,
        submittedAt: new Date('2026-04-20T00:00:00.000Z'),
      },
    ]),
    review: vi.fn().mockResolvedValue({
      id: 'appeal-1',
      appellantId: 'emp-1',
      cycleId: 'cycle-1',
      subjectId: 'emp-1',
      targetType: 'FEEDBACK',
      targetId: 'feedback-1',
      reason: '理由',
      desiredOutcome: '再確認',
      status: 'UNDER_REVIEW',
      reviewerId: 'hr-1',
      reviewComment: '確認開始',
      reviewedAt: new Date('2026-04-21T00:00:00.000Z'),
      submittedAt: new Date('2026-04-20T00:00:00.000Z'),
    }),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearAppealServiceForTesting()
})

describe('POST /api/appeals', () => {
  it('未認証は401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await POST(
      makePostRequest({
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '評価内容に差異があります',
      }),
    )

    expect(res.status).toBe(401)
  })

  it('不正 payload は422', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'emp-1'))
    setAppealServiceForTesting(makeService())

    const res = await POST(makePostRequest({ targetType: 'FEEDBACK', targetId: '' }))

    expect(res.status).toBe(422)
  })
})

describe('GET /api/appeals', () => {
  it('HR_MANAGER が一覧を取得できる', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    const service = makeService()
    setAppealServiceForTesting(service)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(service.listPending).toHaveBeenCalledWith('hr-1')
  })

  it('EMPLOYEE は403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'emp-1'))
    setAppealServiceForTesting(makeService())

    const res = await GET()

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/appeals/[appealId]', () => {
  it('HR_MANAGER が審査更新できる', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    const service = makeService()
    setAppealServiceForTesting(service)

    const res = await PATCH(
      makePatchRequest('appeal-1', {
        status: 'UNDER_REVIEW',
        reviewComment: '確認開始',
      }),
      { params: Promise.resolve({ appealId: 'appeal-1' }) },
    )

    expect(res.status).toBe(200)
    expect(service.review).toHaveBeenCalledWith('hr-1', 'appeal-1', {
      status: 'UNDER_REVIEW',
      reviewComment: '確認開始',
    })
  })

  it('存在しない appeal は404', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    setAppealServiceForTesting(
      makeService({
        review: vi.fn().mockRejectedValue(new AppealNotFoundError('appeal-404')),
      }),
    )

    const res = await PATCH(
      makePatchRequest('appeal-404', {
        status: 'UNDER_REVIEW',
        reviewComment: '確認開始',
      }),
      { params: Promise.resolve({ appealId: 'appeal-404' }) },
    )

    expect(res.status).toBe(404)
  })

  it('不正な遷移は409', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    setAppealServiceForTesting(
      makeService({
        review: vi
          .fn()
          .mockRejectedValue(new AppealInvalidStatusTransitionError('SUBMITTED', 'ACCEPTED')),
      }),
    )

    const res = await PATCH(
      makePatchRequest('appeal-1', {
        status: 'ACCEPTED',
        reviewComment: 'いきなり認容',
      }),
      { params: Promise.resolve({ appealId: 'appeal-1' }) },
    )

    expect(res.status).toBe(409)
  })

  it('期限超過エラーは submit 側で422', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'emp-1'))
    setAppealServiceForTesting(
      makeService({
        submitAppeal: vi
          .fn()
          .mockRejectedValue(new AppealDeadlineExceededError(new Date('2026-04-15T00:00:00.000Z'))),
      }),
    )

    const res = await POST(
      makePostRequest({
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '期限切れ',
      }),
    )

    expect(res.status).toBe(422)
  })

  it('対象なしは submit 側で404', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'emp-1'))
    setAppealServiceForTesting(
      makeService({
        submitAppeal: vi
          .fn()
          .mockRejectedValue(new AppealTargetNotFoundError('FEEDBACK', 'feedback-1')),
      }),
    )

    const res = await POST(
      makePostRequest({
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '対象なし',
      }),
    )

    expect(res.status).toBe(404)
  })
})
