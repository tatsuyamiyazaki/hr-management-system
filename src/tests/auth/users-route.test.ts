/**
 * Task 6.5 / Req 1.10: POST /api/users ルートハンドラのテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { EmailAlreadyExistsError } from '@/lib/auth/invitation-types'
import {
  setInvitationServiceForTesting,
  clearInvitationServiceForTesting,
} from '@/lib/auth/invitation-service-di'
import type { InvitationService } from '@/lib/auth/invitation-service'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { POST } = await import('@/app/api/users/route')

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeAdminSession(userId = 'admin-1') {
  return { user: { email: 'admin@example.com' }, role: 'ADMIN', userId }
}

function makeInvitationService(overrides?: Partial<InvitationService>): InvitationService {
  return {
    inviteUser: vi.fn().mockResolvedValue(undefined),
    acceptInvitation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as InvitationService
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearInvitationServiceForTesting()
})

describe('POST /api/users', () => {
  it('未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ email: 'u@example.com', role: 'EMPLOYEE' }))
    expect(res.status).toBe(401)
  })

  it('ADMIN 以外のロールは 403', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { email: 'hr@example.com' },
      role: 'HR_MANAGER',
      userId: 'hr-1',
    })
    setInvitationServiceForTesting(makeInvitationService())
    const res = await POST(makeRequest({ email: 'u@example.com', role: 'EMPLOYEE' }))
    expect(res.status).toBe(403)
  })

  it('入力バリデーション失敗は 422', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    setInvitationServiceForTesting(makeInvitationService())
    const res = await POST(makeRequest({ email: 'not-an-email', role: 'EMPLOYEE' }))
    expect(res.status).toBe(422)
  })

  it('正常招待で 201 を返す', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    setInvitationServiceForTesting(makeInvitationService())
    const res = await POST(makeRequest({ email: 'new@example.com', role: 'EMPLOYEE' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('メール重複は 409', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    setInvitationServiceForTesting(
      makeInvitationService({
        inviteUser: vi.fn().mockRejectedValue(new EmailAlreadyExistsError()),
      }),
    )
    const res = await POST(makeRequest({ email: 'exists@example.com', role: 'EMPLOYEE' }))
    expect(res.status).toBe(409)
  })

  it('サービス未初期化は 503', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    // サービス未設定のまま
    const res = await POST(makeRequest({ email: 'new@example.com', role: 'EMPLOYEE' }))
    expect(res.status).toBe(503)
  })
})
