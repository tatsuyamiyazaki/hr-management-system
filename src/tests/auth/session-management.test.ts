/**
 * Task 6.4 / Req 1.14, 1.15: セッション一覧と手動失効機能のテスト
 *
 * - listByUser / revokeByUser: SessionStore レベル
 * - listSessions / revokeSession: AuthService レベル
 */
import { describe, it, expect } from 'vitest'
import { SessionNotFoundError, type Session } from '@/lib/auth/auth-types'
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  createInMemorySessionStore,
} from '@/lib/auth/session-store'
import { createAuthService } from '@/lib/auth/auth-service'
import { createInMemoryAuthUserRepository } from '@/lib/auth/user-repository'
import type { PasswordHasher } from '@/lib/auth/password-hasher'

const BASE_NOW = new Date('2026-04-17T00:00:00.000Z')

function makeSession(
  overrides: Partial<Session> & { id: string; userId: string },
  now: Date = BASE_NOW,
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
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    await store.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))
    await store.create(
      makeSession(
        { id: 'sess-2', userId: 'user-1', createdAt: new Date(now.getTime() + 1000) },
        now,
      ),
    )

    const sessions = await store.listByUser('user-1', now)
    const ids = sessions.map((s) => s.id)
    expect(ids).toContain('sess-1')
    expect(ids).toContain('sess-2')
    expect(sessions.length).toBe(2)
  })

  it('他のユーザーのセッションは返さない', async () => {
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    await store.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))
    await store.create(makeSession({ id: 'sess-2', userId: 'user-2' }, now))

    const sessions = await store.listByUser('user-1', now)
    expect(sessions.length).toBe(1)
    expect(sessions[0]!.id).toBe('sess-1')
  })

  it('セッションが存在しない場合は空配列を返す', async () => {
    const store = createInMemorySessionStore({ clock: () => BASE_NOW })
    expect(await store.listByUser('user-1', BASE_NOW)).toEqual([])
  })

  it('createdAt の降順でセッションを返す', async () => {
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    await store.create(makeSession({ id: 'sess-old', userId: 'user-1', createdAt: now }, now))
    await store.create(
      makeSession(
        { id: 'sess-new', userId: 'user-1', createdAt: new Date(now.getTime() + 5000) },
        now,
      ),
    )

    const sessions = await store.listByUser('user-1', now)
    expect(sessions[0]!.id).toBe('sess-new')
    expect(sessions[1]!.id).toBe('sess-old')
  })

  it('絶対期限切れのセッションは含まれない', async () => {
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    await store.create(makeSession({ id: 'sess-active', userId: 'user-1' }, now))
    await store.create(
      makeSession(
        { id: 'sess-expired', userId: 'user-1', expiresAt: new Date(now.getTime() - 1) },
        now,
      ),
    )

    const sessions = await store.listByUser('user-1', now)
    expect(sessions.length).toBe(1)
    expect(sessions[0]!.id).toBe('sess-active')
  })

  it('idle timeout 超過 (lastAccessAt が SESSION_IDLE_TTL_MS より古い) セッションは含まれない', async () => {
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    // lastAccessAt が now - (SESSION_IDLE_TTL_MS + 1ms) → idle 超過
    const staleLastAccess = new Date(now.getTime() - SESSION_IDLE_TTL_MS - 1)
    await store.create(makeSession({ id: 'sess-active', userId: 'user-1' }, now))
    await store.create(
      makeSession(
        {
          id: 'sess-idle',
          userId: 'user-1',
          lastAccessAt: staleLastAccess,
        },
        now,
      ),
    )

    const sessions = await store.listByUser('user-1', now)
    expect(sessions.length).toBe(1)
    expect(sessions[0]!.id).toBe('sess-active')
  })

  it('lastAccessAt がちょうど SESSION_IDLE_TTL_MS 以内なら含まれる (境界値)', async () => {
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    // lastAccessAt が now - SESSION_IDLE_TTL_MS → ちょうど境界、含まれる
    const edgeLastAccess = new Date(now.getTime() - SESSION_IDLE_TTL_MS)
    await store.create(
      makeSession(
        {
          id: 'sess-edge',
          userId: 'user-1',
          lastAccessAt: edgeLastAccess,
        },
        now,
      ),
    )

    const sessions = await store.listByUser('user-1', now)
    expect(sessions.length).toBe(1)
    expect(sessions[0]!.id).toBe('sess-edge')
  })

  it('絶対期限/idle timeout の両方を満たすセッションのみ返す', async () => {
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    // 1. 両方OK
    await store.create(makeSession({ id: 'sess-ok', userId: 'user-1' }, now))
    // 2. 絶対期限切れ
    await store.create(
      makeSession(
        { id: 'sess-expired', userId: 'user-1', expiresAt: new Date(now.getTime() - 1) },
        now,
      ),
    )
    // 3. idle timeout 超過
    await store.create(
      makeSession(
        {
          id: 'sess-idle',
          userId: 'user-1',
          lastAccessAt: new Date(now.getTime() - SESSION_IDLE_TTL_MS - 1000),
        },
        now,
      ),
    )

    const sessions = await store.listByUser('user-1', now)
    expect(sessions.length).toBe(1)
    expect(sessions[0]!.id).toBe('sess-ok')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SessionStore.revokeByUser
// ─────────────────────────────────────────────────────────────────────────────

describe('InMemorySessionStore.revokeByUser', () => {
  it('所有セッションを失効できる', async () => {
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    await store.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))
    await store.revokeByUser('user-1', 'sess-1')

    await expect(store.get('sess-1', now)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('他ユーザーのセッションは SessionNotFoundError', async () => {
    const now = BASE_NOW
    const store = createInMemorySessionStore({ clock: () => now })

    await store.create(makeSession({ id: 'sess-1', userId: 'user-2' }, now))

    await expect(store.revokeByUser('user-1', 'sess-1')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    )
  })

  it('存在しないセッションは SessionNotFoundError', async () => {
    const store = createInMemorySessionStore({ clock: () => BASE_NOW })

    await expect(store.revokeByUser('user-1', 'no-such-session')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    )
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

  function buildService(now: Date = BASE_NOW) {
    const sessions = createInMemorySessionStore({ clock: () => now })
    const service = createAuthService({
      users: createInMemoryAuthUserRepository([]),
      sessions,
      passwordHasher: stubHasher,
      appSecret: 'test-secret',
      clock: () => now,
    })
    return { sessions, service }
  }

  it('ユーザーのセッション一覧を返す', async () => {
    const now = BASE_NOW
    const { sessions, service } = buildService(now)

    await sessions.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))
    await sessions.create(makeSession({ id: 'sess-2', userId: 'user-1' }, now))

    const result = await service.listSessions('user-1')
    expect(result.length).toBe(2)
    expect(result.map((s) => s.id)).toEqual(expect.arrayContaining(['sess-1', 'sess-2']))
  })

  it('他ユーザーのセッションは含まれない', async () => {
    const now = BASE_NOW
    const { sessions, service } = buildService(now)

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

  function buildService(now: Date = BASE_NOW) {
    const sessions = createInMemorySessionStore({ clock: () => now })
    const service = createAuthService({
      users: createInMemoryAuthUserRepository([]),
      sessions,
      passwordHasher: stubHasher,
      appSecret: 'test-secret',
      clock: () => now,
    })
    return { sessions, service }
  }

  it('自分のセッションを失効できる', async () => {
    const now = BASE_NOW
    const { sessions, service } = buildService(now)

    await sessions.create(makeSession({ id: 'sess-1', userId: 'user-1' }, now))
    await expect(service.revokeSession('user-1', 'sess-1')).resolves.toBeUndefined()

    await expect(sessions.get('sess-1', now)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('他ユーザーのセッションを失効しようとすると SessionNotFoundError', async () => {
    const now = BASE_NOW
    const { sessions, service } = buildService(now)

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
