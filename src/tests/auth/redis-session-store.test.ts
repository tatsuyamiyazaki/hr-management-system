/**
 * Task 6.1: RedisSessionStore のコントラクトテスト
 *
 * 実 Redis には繋がず、ioredis の Redis インターフェースを実装した最小限の
 * インメモリダブルで set/get/del を検証する。
 */
import { describe, it, expect } from 'vitest'
import type { Redis } from 'ioredis'
import {
  SessionExpiredError,
  SessionIdleTimeoutError,
  SessionNotFoundError,
  type Session,
} from '@/lib/auth/auth-types'
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  createRedisSessionStore,
} from '@/lib/auth/session-store'

// ─────────────────────────────────────────────────────────────────────────────
// ioredis を模した薄いインメモリダブル
// ─────────────────────────────────────────────────────────────────────────────

interface FakeRedisEntry {
  readonly value: string
  readonly ttlSec: number
}

function createFakeRedis(): Redis & { readonly calls: Array<readonly [string, ...unknown[]]> } {
  const store = new Map<string, FakeRedisEntry>()
  const calls: Array<readonly [string, ...unknown[]]> = []
  const fake = {
    async get(key: string): Promise<string | null> {
      calls.push(['get', key])
      const entry = store.get(key)
      return entry ? entry.value : null
    },
    async set(key: string, value: string, mode: string, ttl: number): Promise<'OK'> {
      calls.push(['set', key, value, mode, ttl])
      if (mode !== 'EX') throw new Error(`unexpected set mode: ${mode}`)
      store.set(key, { value, ttlSec: ttl })
      return 'OK'
    },
    async del(key: string): Promise<number> {
      calls.push(['del', key])
      return store.delete(key) ? 1 : 0
    },
    calls,
  }
  return fake as unknown as Redis & { readonly calls: typeof calls }
}

function makeSession(now: Date, overrides?: Partial<Session>): Session {
  return {
    id: 'sess-redis-1',
    userId: 'user-1',
    role: 'EMPLOYEE',
    email: 'alice@example.com',
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
    lastAccessAt: now,
    ...overrides,
  }
}

describe('createRedisSessionStore', () => {
  it('create → get で Session を復元できる', async () => {
    const redis = createFakeRedis()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const store = createRedisSessionStore({ redis, clock: () => now })
    const session = makeSession(now, {
      ipAddress: '192.0.2.9',
      userAgent: 'redis-test/1.0',
    })

    await store.create(session)
    const fetched = await store.get(session.id, now)

    expect(fetched.id).toBe(session.id)
    expect(fetched.userId).toBe(session.userId)
    expect(fetched.role).toBe('EMPLOYEE')
    expect(fetched.email).toBe(session.email)
    expect(fetched.ipAddress).toBe('192.0.2.9')
    expect(fetched.userAgent).toBe('redis-test/1.0')
    expect(fetched.expiresAt.toISOString()).toBe(session.expiresAt.toISOString())
  })

  it('set には EXPIRE (絶対期限の残り秒) を付けている', async () => {
    const redis = createFakeRedis()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const store = createRedisSessionStore({ redis, clock: () => now })
    await store.create(makeSession(now))

    const setCall = redis.calls.find((c) => c[0] === 'set')
    expect(setCall).toBeDefined()
    const ttl = setCall?.[4] as number
    // 8h = 28800 秒 ± 1
    expect(ttl).toBeGreaterThanOrEqual(28799)
    expect(ttl).toBeLessThanOrEqual(28801)
  })

  it('存在しないキーは SessionNotFoundError', async () => {
    const redis = createFakeRedis()
    const store = createRedisSessionStore({ redis })
    await expect(store.get('missing', new Date())).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('絶対期限超過は SessionExpiredError を投げてキーを削除', async () => {
    const redis = createFakeRedis()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const store = createRedisSessionStore({ redis, clock: () => now })
    await store.create(makeSession(now))

    const expired = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS + 1000)
    await expect(store.get('sess-redis-1', expired)).rejects.toBeInstanceOf(SessionExpiredError)
    // 削除後に再 get → NotFound
    await expect(store.get('sess-redis-1', expired)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('idle 超過は SessionIdleTimeoutError', async () => {
    const redis = createFakeRedis()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const store = createRedisSessionStore({ redis, clock: () => now })
    await store.create(makeSession(now))

    const idled = new Date(now.getTime() + SESSION_IDLE_TTL_MS + 1000)
    await expect(store.get('sess-redis-1', idled)).rejects.toBeInstanceOf(SessionIdleTimeoutError)
  })

  it('touch で lastAccessAt が更新され、絶対期限は変わらない', async () => {
    const redis = createFakeRedis()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const store = createRedisSessionStore({ redis, clock: () => now })
    const session = makeSession(now)
    await store.create(session)

    const later = new Date(now.getTime() + 5 * 60 * 1000)
    const touched = await store.touch('sess-redis-1', later)
    expect(touched.lastAccessAt.getTime()).toBe(later.getTime())
    expect(touched.expiresAt.toISOString()).toBe(session.expiresAt.toISOString())
  })

  it('delete でキーが消える', async () => {
    const redis = createFakeRedis()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const store = createRedisSessionStore({ redis, clock: () => now })
    await store.create(makeSession(now))

    await store.delete('sess-redis-1')
    await expect(store.get('sess-redis-1', now)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('破損 JSON は NotFound 扱い + キー掃除', async () => {
    const redis = createFakeRedis()
    const now = new Date('2026-04-17T00:00:00.000Z')
    // 手動で破損したペイロードを事前投入
    await redis.set('session:sess-bad', 'not-json', 'EX', 60)
    const store = createRedisSessionStore({ redis })

    await expect(store.get('sess-bad', now)).rejects.toBeInstanceOf(SessionNotFoundError)
  })
})
