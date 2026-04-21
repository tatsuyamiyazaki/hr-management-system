import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

import { GET as listSessionsRoute } from '@/app/api/auth/sessions/route'
import { DELETE as revokeSessionRoute } from '@/app/api/auth/sessions/[sessionId]/route'
import { clearAuthServiceForTesting, setAuthServiceForTesting } from '@/lib/auth/auth-service-di'
import { PasswordPolicyViolationError, type Session } from '@/lib/auth/auth-types'
import { createInMemoryPasswordHistoryRepository } from '@/lib/auth/password-history-repository'
import { createPasswordService } from '@/lib/auth/password-service'
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  createInMemorySessionStore,
} from '@/lib/auth/session-store'
import { createAccessLogMiddleware } from '@/lib/access-log/access-log-middleware'
import { createAuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { AuditLogEntry } from '@/lib/audit/audit-log-types'
import { createRouteGuard, type RoutePolicy } from '@/lib/rbac/next-middleware'
import type { AuthSubject } from '@/lib/rbac/rbac-types'
import type { AuthService } from '@/lib/auth/auth-service'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const NOW = new Date('2026-04-21T09:00:00.000Z')
const USER_ID = 'user-1'
const ADMIN_SESSION_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_SESSION_ID = '22222222-2222-4222-8222-222222222222'
const EXPIRED_SESSION_ID = '33333333-3333-4333-8333-333333333333'
const IDLE_SESSION_ID = '44444444-4444-4444-8444-444444444444'

function makeSession(id: string, overrides?: Partial<Session>): Session {
  return {
    id,
    userId: USER_ID,
    role: 'ADMIN',
    email: 'admin@example.com',
    createdAt: new Date(NOW.getTime() - 10 * 60 * 1000),
    expiresAt: new Date(NOW.getTime() + SESSION_ABSOLUTE_TTL_MS),
    lastAccessAt: new Date(NOW.getTime() - 2 * 60 * 1000),
    ipAddress: '10.0.0.9',
    userAgent: 'vitest-agent',
    ...overrides,
  }
}

type AuthServiceWithStore = AuthService & {
  readonly __store: ReturnType<typeof createInMemorySessionStore>
}

function makeSubject(userId: string, role: AuthSubject['role']): AuthSubject {
  return { userId, role }
}

function makeAuthServiceFromStore(): AuthServiceWithStore {
  const store = createInMemorySessionStore()

  return {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
    touchSession: vi.fn(),
    listSessions: vi.fn(async (userId: string) => store.listByUser(userId, NOW)),
    revokeSession: vi.fn(async (userId: string, sessionId: string) => {
      await store.revokeByUser(userId, sessionId)
    }),
    __store: store,
  } as AuthServiceWithStore
}

describe('auth and access control e2e', () => {
  beforeEach(() => {
    mockedGetServerSession.mockReset()
  })

  afterEach(() => {
    clearAuthServiceForTesting()
  })

  it('covers role-based access, session lifecycle, password history, and audit tamper rejection', async () => {
    const deniedAuditEntries: AuditLogEntry[] = []
    const accessLogs: Array<{ path: string; statusCode: number; requestId: string }> = []

    const routePolicies: readonly RoutePolicy[] = [
      {
        pathPattern: /^\/api\/admin(\/.*)?$/,
        allowedRoles: ['ADMIN'],
        resourceType: 'SYSTEM_CONFIG',
      },
    ]

    const deniedGuard = createRouteGuard({
      policies: routePolicies,
      subjectProvider: {
        getSubject: vi.fn(async () => makeSubject('employee-1', 'EMPLOYEE')),
      },
      auditLogger: {
        emit: vi.fn(async (entry) => {
          deniedAuditEntries.push(entry as AuditLogEntry)
        }),
      },
    })

    const guardedAccessLogger = createAccessLogMiddleware({
      repository: {
        insert: vi.fn(async (entry) => {
          accessLogs.push({
            path: entry.path,
            statusCode: entry.statusCode,
            requestId: entry.requestId,
          })
        }),
        findMany: vi.fn(),
      },
    })

    const deniedRequest = new NextRequest('http://localhost/api/admin/users', {
      headers: {
        'x-forwarded-for': '10.0.0.9',
        'user-agent': 'vitest-agent',
        'x-request-id': 'req-denied',
      },
    })

    const deniedResponse = await guardedAccessLogger(deniedRequest, async (request) => {
      const result = await deniedGuard.guard(request)
      return result ?? NextResponse.json({ ok: true })
    })

    expect(deniedResponse.status).toBe(403)
    expect(deniedAuditEntries).toHaveLength(1)
    expect(deniedAuditEntries[0]).toMatchObject({
      userId: 'employee-1',
      action: 'ACCESS_DENIED',
      resourceType: 'SYSTEM_CONFIG',
      after: {
        reason: 'DENIED_INSUFFICIENT_ROLE',
        subjectRole: 'EMPLOYEE',
      },
    })
    expect(accessLogs).toContainEqual({
      path: '/api/admin/users',
      statusCode: 403,
      requestId: 'req-denied',
    })

    const allowedGuard = createRouteGuard({
      policies: routePolicies,
      subjectProvider: {
        getSubject: vi.fn(async () => makeSubject(USER_ID, 'ADMIN')),
      },
      auditLogger: {
        emit: vi.fn(async () => undefined),
      },
    })

    const allowedRequest = new NextRequest('http://localhost/api/admin/users', {
      headers: {
        'x-forwarded-for': '10.0.0.9',
        'user-agent': 'vitest-agent',
        'x-request-id': 'req-allowed',
      },
    })

    const allowedResponse = await guardedAccessLogger(allowedRequest, async (request) => {
      const result = await allowedGuard.guard(request)
      return result ?? NextResponse.json({ ok: true }, { status: 200 })
    })

    expect(allowedResponse.status).toBe(200)
    expect(accessLogs).toContainEqual({
      path: '/api/admin/users',
      statusCode: 200,
      requestId: 'req-allowed',
    })

    const authService = makeAuthServiceFromStore()
    await authService.__store.create(makeSession(ADMIN_SESSION_ID))
    await authService.__store.create(
      makeSession(OTHER_SESSION_ID, {
        createdAt: new Date(NOW.getTime() - 20 * 60 * 1000),
      }),
    )
    await authService.__store.create(
      makeSession(EXPIRED_SESSION_ID, {
        expiresAt: new Date(NOW.getTime() - 1_000),
      }),
    )
    await authService.__store.create(
      makeSession(IDLE_SESSION_ID, {
        lastAccessAt: new Date(NOW.getTime() - SESSION_IDLE_TTL_MS - 1_000),
      }),
    )
    setAuthServiceForTesting(authService)

    mockedGetServerSession.mockResolvedValue({
      user: { email: 'admin@example.com' },
      userId: USER_ID,
      sessionId: ADMIN_SESSION_ID,
    })

    const listResponse = await listSessionsRoute(
      new NextRequest('http://localhost/api/auth/sessions'),
    )
    expect(listResponse.status).toBe(200)

    const listBody = await listResponse.json()
    expect(listBody.sessions).toHaveLength(2)
    expect(listBody.sessions.map((session: { id: string }) => session.id)).toEqual([
      ADMIN_SESSION_ID,
      OTHER_SESSION_ID,
    ])
    expect(
      listBody.sessions.find((session: { id: string }) => session.id === ADMIN_SESSION_ID)
        ?.isCurrent,
    ).toBe(true)

    const revokeResponse = await revokeSessionRoute(
      new NextRequest(`http://localhost/api/auth/sessions/${OTHER_SESSION_ID}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ sessionId: OTHER_SESSION_ID }) },
    )

    expect(revokeResponse.status).toBe(204)

    const afterRevokeResponse = await listSessionsRoute(
      new NextRequest('http://localhost/api/auth/sessions'),
    )
    const afterRevokeBody = await afterRevokeResponse.json()
    expect(afterRevokeBody.sessions).toHaveLength(1)
    expect(afterRevokeBody.sessions[0].id).toBe(ADMIN_SESSION_ID)

    const passwordHistory = createInMemoryPasswordHistoryRepository([
      {
        userId: USER_ID,
        hash: 'hash:OldPassword!1',
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
      },
      {
        userId: USER_ID,
        hash: 'hash:OtherPassword!2',
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
      },
    ])

    const persistedHashes: string[] = []
    const passwordService = createPasswordService({
      hasher: {
        hash: vi.fn(async (plain) => `hash:${plain}`),
        verify: vi.fn(async (plain, hash) => hash === `hash:${plain}`),
      },
      history: passwordHistory,
      persist: {
        updateUserPasswordHash: vi.fn(async (_userId, hash) => {
          persistedHashes.push(hash)
        }),
      },
    })

    await expect(
      passwordService.changePassword({
        userId: USER_ID,
        newPassword: 'OldPassword!1',
      }),
    ).rejects.toEqual(new PasswordPolicyViolationError('REUSED'))

    await passwordService.changePassword({
      userId: USER_ID,
      newPassword: 'BrandNewPass!9',
    })
    expect(persistedHashes).toEqual(['hash:BrandNewPass!9'])

    const tamperedDb = {
      auditLog: {
        create: vi.fn(async ({ data }: { data: { after?: unknown } }) => {
          if (Array.isArray(data.after)) {
            throw new Error('tampered audit log payload rejected by DB')
          }
          return { id: 'audit-1' }
        }),
      },
    }

    const emitter = createAuditLogEmitter(tamperedDb as never)
    await expect(
      emitter.emit({
        userId: USER_ID,
        action: 'ACCESS_DENIED',
        resourceType: 'SYSTEM_CONFIG',
        resourceId: 'settings',
        ipAddress: '10.0.0.9',
        userAgent: 'vitest-agent',
        before: null,
        after: ['tampered'] as never,
      }),
    ).resolves.toBeUndefined()
    expect(tamperedDb.auditLog.create).toHaveBeenCalledTimes(1)
  })
})
