import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { GET } from '@/app/api/one-on-one/sessions/[sessionId]/route'
import {
  clearOneOnOneSessionServiceForTesting,
  setOneOnOneSessionServiceForTesting,
} from '@/lib/one-on-one/one-on-one-session-service-di'
import type { OneOnOneSessionService } from '@/lib/one-on-one/one-on-one-session-service'
import type { OneOnOneSessionRecord } from '@/lib/one-on-one/one-on-one-types'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const mockGetServerSession = vi.mocked(getServerSession)

function makeSession(overrides: Partial<OneOnOneSessionRecord> = {}): OneOnOneSessionRecord {
  const now = new Date('2026-04-20T10:00:00.000Z')
  return {
    id: 'sess-1',
    managerId: 'mgr-1',
    employeeId: 'emp-1',
    scheduledAt: now,
    durationMin: 30,
    agenda: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeService(record: OneOnOneSessionRecord | null): OneOnOneSessionService {
  return {
    createSession: vi.fn(),
    listMySessions: vi.fn(),
    getSession: vi.fn(async () => record),
    updateSession: vi.fn(),
  } as unknown as OneOnOneSessionService
}

async function callGet(sessionId = 'sess-1'): Promise<Response> {
  const request = new NextRequest(`https://example.test/api/one-on-one/sessions/${sessionId}`)
  return GET(request, { params: Promise.resolve({ sessionId }) })
}

describe('GET /api/one-on-one/sessions/[sessionId]', () => {
  afterEach(() => {
    clearOneOnOneSessionServiceForTesting()
    vi.clearAllMocks()
  })

  it('セッション参加者でない一般社員には 403 を返す', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: 'other@example.com' },
      userId: 'emp-other',
      role: 'EMPLOYEE',
    })
    setOneOnOneSessionServiceForTesting(makeService(makeSession()))

    const response = await callGet()

    expect(response.status).toBe(403)
  })

  it('対象社員本人には詳細を返す', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: 'emp@example.com' },
      userId: 'emp-1',
      role: 'EMPLOYEE',
    })
    setOneOnOneSessionServiceForTesting(makeService(makeSession()))

    const response = await callGet()
    const body = (await response.json()) as { success: boolean }

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
  })
})
