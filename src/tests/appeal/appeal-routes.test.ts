import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  clearAppealServiceForTesting,
  setAppealServiceForTesting,
} from '@/lib/appeal/appeal-service-di'
import type { AppealService } from '@/lib/appeal/appeal-types'
import { AppealDeadlineExceededError, AppealTargetNotFoundError } from '@/lib/appeal/appeal-types'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { POST } = await import('@/app/api/appeals/route')

function makeSession(role: string, userId = 'user-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/appeals', {
    method: 'POST',
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
      reason: '内容に事実誤認があります',
      desiredOutcome: '再確認してほしい',
      status: 'SUBMITTED',
      reviewerId: null,
      reviewComment: null,
      reviewedAt: null,
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
      makeRequest({
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '内容に事実誤認があります',
      }),
    )

    expect(res.status).toBe(401)
  })

  it('EMPLOYEE 以外は403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER'))
    setAppealServiceForTesting(makeService())

    const res = await POST(
      makeRequest({
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '内容に事実誤認があります',
      }),
    )

    expect(res.status).toBe(403)
  })

  it('不正payloadは422', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'emp-1'))
    setAppealServiceForTesting(makeService())

    const res = await POST(makeRequest({ targetType: 'FEEDBACK', targetId: '' }))

    expect(res.status).toBe(422)
  })

  it('対象が見つからない場合は404', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'emp-1'))
    setAppealServiceForTesting(
      makeService({
        submitAppeal: vi
          .fn()
          .mockRejectedValue(new AppealTargetNotFoundError('FEEDBACK', 'feedback-1')),
      }),
    )

    const res = await POST(
      makeRequest({
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '内容に事実誤認があります',
      }),
    )

    expect(res.status).toBe(404)
  })

  it('期限超過は422', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'emp-1'))
    setAppealServiceForTesting(
      makeService({
        submitAppeal: vi
          .fn()
          .mockRejectedValue(new AppealDeadlineExceededError(new Date('2026-04-15T00:00:00.000Z'))),
      }),
    )

    const res = await POST(
      makeRequest({
        targetType: 'FEEDBACK',
        targetId: 'feedback-1',
        reason: '期限切れ確認',
      }),
    )

    expect(res.status).toBe(422)
  })

  it('EMPLOYEE が異議申立てを送信できる', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'emp-1'))
    const service = makeService()
    setAppealServiceForTesting(service)

    const res = await POST(
      makeRequest({
        targetType: 'TOTAL_EVALUATION',
        targetId: 'result-1',
        reason: '総合評価の根拠を確認したい',
        desiredOutcome: '評価内容を見直してほしい',
      }),
    )

    expect(res.status).toBe(201)
    expect(service.submitAppeal).toHaveBeenCalledWith('emp-1', {
      targetType: 'TOTAL_EVALUATION',
      targetId: 'result-1',
      reason: '総合評価の根拠を確認したい',
      desiredOutcome: '評価内容を見直してほしい',
    })
  })
})
