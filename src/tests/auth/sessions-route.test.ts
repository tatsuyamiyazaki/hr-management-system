/**
 * Task 6.4 / Req 1.14, 1.15: セッション API ルートハンドラのテスト
 *
 * - GET  /api/auth/sessions       (Req 1.14)
 * - DELETE /api/auth/sessions/:id (Req 1.15)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { SessionNotFoundError, type Session } from '@/lib/auth/auth-types'
import { SESSION_ABSOLUTE_TTL_MS } from '@/lib/auth/session-store'
import { setAuthServiceForTesting, clearAuthServiceForTesting } from '@/lib/auth/auth-service-di'
import type { AuthService } from '@/lib/auth/auth-service'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET } = await import('@/app/api/auth/sessions/route')
const { DELETE } = await import('@/app/api/auth/sessions/[sessionId]/route')

const NOW = new Date('2026-04-17T00:00:00.000Z')

function makeSession(id: string, userId: string): Session {
  return {
    id,
    userId,
    role: 'EMPLOYEE',
    email: 'alice@example.com',
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + SESSION_ABSOLUTE_TTL_MS),
    lastAccessAt: NOW,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
  }
}

function makeAuthenticatedSession(userId: string, sessionId: string) {
  return {
    user: { email: 'alice@example.com' },
    userId,
    sessionId,
  }
}

function makeAuthService(overrides?: Partial<AuthService>): AuthService {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
    touchSession: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    ...overrides,
  } as unknown as AuthService
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/sessions
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/auth/sessions', () => {
  beforeEach(() => {
    mockedGetServerSession.mockReset()
  })

  afterEach(() => {
    clearAuthServiceForTesting()
  })

  it('未認証リクエストは 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/auth/sessions')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('email なしセッションは 401', async () => {
    mockedGetServerSession.mockResolvedValue({ user: {} })

    const req = new NextRequest('http://localhost/api/auth/sessions')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('userId なしセッションは 401', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { email: 'alice@example.com' },
    })

    const req = new NextRequest('http://localhost/api/auth/sessions')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('正常: セッション一覧と isCurrent フラグを返す', async () => {
    const currentSessionId = 'current-sess-id'
    const otherSessionId = 'other-sess-id'

    mockedGetServerSession.mockResolvedValue(makeAuthenticatedSession('user-1', currentSessionId))

    const mockService = makeAuthService({
      listSessions: vi
        .fn()
        .mockResolvedValue([
          makeSession(currentSessionId, 'user-1'),
          makeSession(otherSessionId, 'user-1'),
        ]),
    })
    setAuthServiceForTesting(mockService)

    const req = new NextRequest('http://localhost/api/auth/sessions')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions).toHaveLength(2)

    const current = body.sessions.find((s: { id: string }) => s.id === currentSessionId)
    const other = body.sessions.find((s: { id: string }) => s.id === otherSessionId)
    expect(current?.isCurrent).toBe(true)
    expect(other?.isCurrent).toBe(false)
  })

  it('sessionId 未設定でも一覧は返す (全て isCurrent: false)', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { email: 'alice@example.com' },
      userId: 'user-1',
    })

    const mockService = makeAuthService({
      listSessions: vi.fn().mockResolvedValue([makeSession('sess-1', 'user-1')]),
    })
    setAuthServiceForTesting(mockService)

    const req = new NextRequest('http://localhost/api/auth/sessions')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions[0].isCurrent).toBe(false)
  })

  it('AuthService がスローすると 500', async () => {
    mockedGetServerSession.mockResolvedValue(makeAuthenticatedSession('user-1', 'sess-1'))

    const mockService = makeAuthService({
      listSessions: vi.fn().mockRejectedValue(new Error('DB error')),
    })
    setAuthServiceForTesting(mockService)

    const req = new NextRequest('http://localhost/api/auth/sessions')
    const res = await GET(req)

    expect(res.status).toBe(500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/sessions/:sessionId
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/auth/sessions/:sessionId', () => {
  const VALID_UUID = '00000000-0000-4000-8000-000000000001'

  beforeEach(() => {
    mockedGetServerSession.mockReset()
  })

  afterEach(() => {
    clearAuthServiceForTesting()
  })

  it('未認証リクエストは 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const req = new NextRequest(`http://localhost/api/auth/sessions/${VALID_UUID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: VALID_UUID }) })

    expect(res.status).toBe(401)
  })

  it('userId なしセッションは 401', async () => {
    mockedGetServerSession.mockResolvedValue({ user: { email: 'alice@example.com' } })

    const req = new NextRequest(`http://localhost/api/auth/sessions/${VALID_UUID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: VALID_UUID }) })

    expect(res.status).toBe(401)
  })

  it('UUID 形式でない sessionId は 400', async () => {
    mockedGetServerSession.mockResolvedValue(makeAuthenticatedSession('user-1', 'curr-sess'))

    const req = new NextRequest('http://localhost/api/auth/sessions/not-a-uuid', {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: 'not-a-uuid' }) })

    expect(res.status).toBe(400)
  })

  it('正常: 成功時は 204 No Content', async () => {
    mockedGetServerSession.mockResolvedValue(makeAuthenticatedSession('user-1', 'curr-sess'))

    const mockService = makeAuthService({
      revokeSession: vi.fn().mockResolvedValue(undefined),
    })
    setAuthServiceForTesting(mockService)

    const req = new NextRequest(`http://localhost/api/auth/sessions/${VALID_UUID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: VALID_UUID }) })

    expect(res.status).toBe(204)
    expect(mockService.revokeSession).toHaveBeenCalledWith('user-1', VALID_UUID)
  })

  it('SessionNotFoundError は 404', async () => {
    mockedGetServerSession.mockResolvedValue(makeAuthenticatedSession('user-1', 'curr-sess'))

    const mockService = makeAuthService({
      revokeSession: vi.fn().mockRejectedValue(new SessionNotFoundError(VALID_UUID)),
    })
    setAuthServiceForTesting(mockService)

    const req = new NextRequest(`http://localhost/api/auth/sessions/${VALID_UUID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: VALID_UUID }) })

    expect(res.status).toBe(404)
  })

  it('予期せぬエラーは 500', async () => {
    mockedGetServerSession.mockResolvedValue(makeAuthenticatedSession('user-1', 'curr-sess'))

    const mockService = makeAuthService({
      revokeSession: vi.fn().mockRejectedValue(new Error('unexpected')),
    })
    setAuthServiceForTesting(mockService)

    const req = new NextRequest(`http://localhost/api/auth/sessions/${VALID_UUID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: VALID_UUID }) })

    expect(res.status).toBe(500)
  })
})
