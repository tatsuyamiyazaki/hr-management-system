/**
 * Task 6.1 / Req 1.4, 1.5, 1.6: SessionStore (InMemory) の単体テスト
 */
import { describe, it, expect } from 'vitest'
import {
  SessionExpiredError,
  SessionIdleTimeoutError,
  SessionNotFoundError,
  type Session,
} from '@/lib/auth/auth-types'
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  createInMemorySessionStore,
} from '@/lib/auth/session-store'

function makeSession(now: Date, overrides?: Partial<Session>): Session {
  return {
    id: 'sess-1',
    userId: 'user-1',
    role: 'EMPLOYEE',
    email: 'alice@example.com',
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
    lastAccessAt: now,
    ...overrides,
  }
}

describe('createInMemorySessionStore', () => {
  it('create したセッションを get で取得できる', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const session = makeSession(now)

    await store.create(session)
    const fetched = await store.get('sess-1', now)

    expect(fetched.id).toBe('sess-1')
    expect(fetched.userId).toBe('user-1')
    expect(fetched.role).toBe('EMPLOYEE')
    expect(fetched.expiresAt.getTime()).toBe(now.getTime() + SESSION_ABSOLUTE_TTL_MS)
  })

  it('存在しないセッションは SessionNotFoundError', async () => {
    const store = createInMemorySessionStore()
    await expect(store.get('missing', new Date())).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('絶対期限 (8h) を過ぎると SessionExpiredError', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))

    const laterMs = now.getTime() + SESSION_ABSOLUTE_TTL_MS + 1000
    await expect(store.get('sess-1', new Date(laterMs))).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('絶対期限を過ぎた後は get すると削除されて NotFound', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))
    const expired = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS + 1000)

    await expect(store.get('sess-1', expired)).rejects.toBeInstanceOf(SessionExpiredError)
    // 二度目は NotFound (expired で既にキーが削除されている)
    await expect(store.get('sess-1', expired)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('30 分 idle 超過で SessionIdleTimeoutError', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))

    const idleExceededMs = now.getTime() + SESSION_IDLE_TTL_MS + 1000
    await expect(store.get('sess-1', new Date(idleExceededMs))).rejects.toBeInstanceOf(
      SessionIdleTimeoutError,
    )
  })

  it('idle 超過後は後続 get が NotFound', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))
    const later = new Date(now.getTime() + SESSION_IDLE_TTL_MS + 1000)

    await expect(store.get('sess-1', later)).rejects.toBeInstanceOf(SessionIdleTimeoutError)
    await expect(store.get('sess-1', later)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('touch で lastAccessAt が更新され、絶対期限は変わらない', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const original = makeSession(now)
    await store.create(original)

    const later = new Date(now.getTime() + 10 * 60 * 1000) // 10 分後
    const touched = await store.touch('sess-1', later)

    expect(touched.lastAccessAt.getTime()).toBe(later.getTime())
    // 絶対期限は発行時に決まった値を維持する
    expect(touched.expiresAt.getTime()).toBe(original.expiresAt.getTime())
  })

  it('touch 後の get は更新後の lastAccessAt を返す', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))

    const later = new Date(now.getTime() + 5 * 60 * 1000)
    await store.touch('sess-1', later)
    const fetched = await store.get('sess-1', later)
    expect(fetched.lastAccessAt.getTime()).toBe(later.getTime())
  })

  it('touch は idle 超過後は失敗する', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))
    const tooLate = new Date(now.getTime() + SESSION_IDLE_TTL_MS + 1000)

    await expect(store.touch('sess-1', tooLate)).rejects.toBeInstanceOf(SessionIdleTimeoutError)
  })

  it('delete で以後 get は NotFound (Req 1.6)', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))

    await store.delete('sess-1')
    await expect(store.get('sess-1', now)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('delete は冪等 (存在しないセッションでも例外を投げない)', async () => {
    const store = createInMemorySessionStore()
    await expect(store.delete('no-such-session')).resolves.toBeUndefined()
  })

  it('独自 idleTtlMs オプションを尊重する', async () => {
    const store = createInMemorySessionStore({ idleTtlMs: 1000 })
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))
    const later = new Date(now.getTime() + 2000)
    await expect(store.get('sess-1', later)).rejects.toBeInstanceOf(SessionIdleTimeoutError)
  })

  it('返されたセッションを改変しても内部状態は変わらない', async () => {
    const store = createInMemorySessionStore()
    const now = new Date('2026-04-17T00:00:00.000Z')
    await store.create(makeSession(now))

    const first = await store.get('sess-1', now)
    ;(first as { email: string }).email = 'hacked@example.com'
    const second = await store.get('sess-1', now)
    expect(second.email).toBe('alice@example.com')
  })
})
