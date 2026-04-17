/**
 * Task 6.4 / Req 1.14, 1.15: セッション一覧と手動失効機能のテスト
 *
 * - listByUser: ユーザーのセッション一覧取得
 * - listSessions (AuthService): ユーザーのセッション一覧
 * - revokeSession (AuthService): セッションの手動失効
 */
import { describe, it, expect } from 'vitest'
import { SessionNotFoundError, type Session } from '@/lib/auth/auth-types'
import { SESSION_ABSOLUTE_TTL_MS, createInMemorySessionStore } from '@/lib/auth/session-store'
import { createAuthService } from '@/lib/auth/auth-service'
import { createInMemoryAuthUserRepository } from '@/lib/auth/user-repository'
import type { PasswordHasher } from '@/lib/auth/password-hasher'

function makeSession(
  overrides: Partial<Session> & { id: string; userId: string },
  now: Date = new Date('2026-04-17T00:00:00.000Z'),
): Session {
  return {
    role: 'EMPLOYEE',
    email: 'alice@example.com',
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
    lastAccessAt: now,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionStore.listByUser
// ─────────────────────────────────────────────────────────────────────────────

describe('InMemorySessionStore.listByUser', () => {
  it('正しいユーザーのセッションを返す', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')

    const s1 = makeSession({ id: 'sess-1', userId: 'user-1' }, now)
    const s2 = makeSession(
      { id: 'sess-2', userId: 'user-1', createdAt: new Date(now.getTime() + 1000) },
      now,
    )
    await store.create(s1)
    await store.create(s2)

    const sessions = await store.listByUser('user-1')
    const ids = sessions.map((s) => s.id)
    expect(ids).toContain('sess-1')
    expect(ids).toContain('sess-2')
    expect(sessions.length).toBe(2)
  })

  it('他のユーザーのセッションは返さない', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')

    await store.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))
    await store.create(makeSession({ id: 'sess-2', userId: 'user-2' }, now))

    const sessions = await store.listByUser('user-1')
    expect(sessions.length).toBe(1)
    expect(sessions[0]!.id).toBe('sess-1')
  })

  it('セッションが存在しない場合は空配列を返す', async () => {
    const store = createInMemorySessionStore()
    const sessions = await store.listByUser('user-1')
    expect(sessions).toEqual([])
  })

  it('createdAt の降順でセッションを返す', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')

    const earlier = makeSession(
      { id: 'sess-old', userId: 'user-1', createdAt: new Date(now.getTime()) },
      now,
    )
    const later = makeSession(
      { id: 'sess-new', userId: 'user-1', createdAt: new Date(now.getTime() + 5000) },
      now,
    )
    await store.create(earlier)
    await store.create(later)

    const sessions = await store.listByUser('user-1')
    expect(sessions[0]!.id).toBe('sess-new')
    expect(sessions[1]!.id).toBe('sess-old')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AuthService.listSessions
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthService.listSessions', () => {
  const stubHasher: PasswordHasher = {
    hash: async (pw: string) => pw,
    verify: async (_pw: string, _hash: string) => true,
  }

  function buildService() {
    const sessions = createInMemorySessionStore()
    const service = createAuthService({
      users: createInMemoryAuthUserRepository([]),
      sessions,
      passwordHasher: stubHasher,
      appSecret: 'test-secret',
    })
    return { sessions, service }
  }

  it('ユーザーのセッション一覧を返す', async () => {
    const { sessions, service } = buildService()
    const now = new Date('2026-04-17T00:00:00.000Z')

    await sessions.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))
    await sessions.create(makeSession({ id: 'sess-2', userId: 'user-1' }, now))

    const result = await service.listSessions('user-1')
    expect(result.length).toBe(2)
  })

  it('他ユーザーのセッションは含まれない', async () => {
    const { sessions, service } = buildService()
    const now = new Date('2026-04-17T00:00:00.000Z')

    await sessions.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))
    await sessions.create(makeSession({ id: 'sess-2', userId: 'user-2' }, now))

    const result = await service.listSessions('user-1')
    expect(result.length).toBe(1)
    expect(result[0]!.id).toBe('sess-1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AuthService.revokeSession
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthService.revokeSession', () => {
  const stubHasher: PasswordHasher = {
    hash: async (pw: string) => pw,
    verify: async (_pw: string, _hash: string) => true,
  }

  function buildService() {
    const sessions = createInMemorySessionStore()
    const service = createAuthService({
      users: createInMemoryAuthUserRepository([]),
      sessions,
      passwordHasher: stubHasher,
      appSecret: 'test-secret',
    })
    return { sessions, service }
  }

  it('自分のセッションを失効できる', async () => {
    const { sessions, service } = buildService()
    const now = new Date('2026-04-17T00:00:00.000Z')

    await sessions.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))

    await expect(service.revokeSession('user-1', 'sess-1')).resolves.toBeUndefined()

    // 削除後は get できないことを確認
    await expect(sessions.get('sess-1', now)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('他ユーザーのセッションを失効しようとすると SessionNotFoundError', async () => {
    const { sessions, service } = buildService()
    const now = new Date('2026-04-17T00:00:00.000Z')

    await sessions.create(makeSession({ id: 'sess-1', userId: 'user-2' }, now))

    await expect(service.revokeSession('user-1', 'sess-1')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    )
  })

  it('存在しないセッションの失効は SessionNotFoundError', async () => {
    const { service } = buildService()

    await expect(service.revokeSession('user-1', 'missing-session')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    )
  })
})
