/**
 * Task 6.5 / Req 1.10: POST /api/auth/invitations/[token] ルートハンドラのテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  InvitationNotFoundError,
  InvitationExpiredError,
  InvitationAlreadyUsedError,
} from '@/lib/auth/invitation-types'
import { PasswordPolicyViolationError } from '@/lib/auth/auth-types'
import {
  setInvitationServiceForTesting,
  clearInvitationServiceForTesting,
} from '@/lib/auth/invitation-service-di'
import type { InvitationService } from '@/lib/auth/invitation-service'

const { POST } = await import('@/app/api/auth/invitations/[token]/route')

function makeRequest(token: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/auth/invitations/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) }
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

describe('POST /api/auth/invitations/[token]', () => {
  it('正常承認で 200 を返す', async () => {
    setInvitationServiceForTesting(makeInvitationService())
    const res = await POST(
      makeRequest('valid-token', { password: 'ValidPass1!extra' }),
      makeParams('valid-token'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('パスワードなしは 422', async () => {
    setInvitationServiceForTesting(makeInvitationService())
    const res = await POST(makeRequest('valid-token', {}), makeParams('valid-token'))
    expect(res.status).toBe(422)
  })

  it('存在しないトークンは 404', async () => {
    setInvitationServiceForTesting(
      makeInvitationService({
        acceptInvitation: vi.fn().mockRejectedValue(new InvitationNotFoundError('bad-token')),
      }),
    )
    const res = await POST(
      makeRequest('bad-token', { password: 'ValidPass1!extra' }),
      makeParams('bad-token'),
    )
    expect(res.status).toBe(404)
  })

  it('期限切れトークンは 410', async () => {
    setInvitationServiceForTesting(
      makeInvitationService({
        acceptInvitation: vi.fn().mockRejectedValue(new InvitationExpiredError()),
      }),
    )
    const res = await POST(
      makeRequest('expired-token', { password: 'ValidPass1!extra' }),
      makeParams('expired-token'),
    )
    expect(res.status).toBe(410)
  })

  it('使用済みトークンは 409', async () => {
    setInvitationServiceForTesting(
      makeInvitationService({
        acceptInvitation: vi.fn().mockRejectedValue(new InvitationAlreadyUsedError()),
      }),
    )
    const res = await POST(
      makeRequest('used-token', { password: 'ValidPass1!extra' }),
      makeParams('used-token'),
    )
    expect(res.status).toBe(409)
  })

  it('パスワードポリシー違反は 422', async () => {
    setInvitationServiceForTesting(
      makeInvitationService({
        acceptInvitation: vi.fn().mockRejectedValue(new PasswordPolicyViolationError('LENGTH')),
      }),
    )
    const res = await POST(
      makeRequest('valid-token', { password: 'short' }),
      makeParams('valid-token'),
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.rule).toBe('LENGTH')
  })

  it('サービス未初期化は 503', async () => {
    // サービス未設定のまま
    const res = await POST(
      makeRequest('valid-token', { password: 'ValidPass1!extra' }),
      makeParams('valid-token'),
    )
    expect(res.status).toBe(503)
  })
})
