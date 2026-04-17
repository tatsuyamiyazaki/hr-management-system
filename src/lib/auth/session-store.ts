/**
 * Task 6.1 / Req 1.4, 1.5, 1.6: セッションストア
 *
 * - 絶対期限 8 時間 (Req 1.4)
 * - 30 分アイドルタイムアウト (Req 1.5)
 * - 明示的な delete でログアウト即時失効 (Req 1.6)
 *
 * Redis 実装と InMemory 実装を提供する。
 * Redis キーは `session:${sessionId}`、値は JSON シリアライズ。
 * Redis 側の EXPIRE は絶対期限の残り秒で毎回更新する (idle 超過での誤残留を防止)。
 */
import type { Redis } from 'ioredis'
import {
  SessionExpiredError,
  SessionIdleTimeoutError,
  SessionNotFoundError,
  type Session,
} from './auth-types'
import type { UserRole } from '@/lib/notification/notification-types'
import { isUserRole } from '@/lib/notification/notification-types'

/** Req 1.4: セッション絶対期限 (8 時間) */
export const SESSION_ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000

/** Req 1.5: アイドルタイムアウト (30 分) */
export const SESSION_IDLE_TTL_MS = 30 * 60 * 1000

/** Redis キー接頭辞 */
const SESSION_KEY_PREFIX = 'session:'

/** Redis: ユーザーごとのセッション ID セット キー接頭辞 */
const USER_SESSIONS_KEY_PREFIX = 'user_sessions:'

function userSessionsKey(userId: string): string {
  return `${USER_SESSIONS_KEY_PREFIX}${userId}`
}

export interface SessionStore {
  create(session: Session): Promise<void>
  /** 期限切れ/アイドル超過の場合は専用例外を throw する */
  get(sessionId: string, now: Date): Promise<Session>
  /** lastAccessAt を now で更新し、更新後の Session を返す */
  touch(sessionId: string, now: Date): Promise<Session>
  delete(sessionId: string): Promise<void>
  /** ユーザーID に紐づく全セッションを createdAt 降順で返す (Req 1.14) */
  listByUser(userId: string): Promise<readonly Session[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// 共通ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`
}

interface SerializedSession {
  readonly id: string
  readonly userId: string
  readonly role: string
  readonly email: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly lastAccessAt: string
  readonly ipAddress?: string
  readonly userAgent?: string
}

function serializeSession(session: Session): SerializedSession {
  return {
    id: session.id,
    userId: session.userId,
    role: session.role,
    email: session.email,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    lastAccessAt: session.lastAccessAt.toISOString(),
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  }
}

function deserializeSession(raw: unknown): Session {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('invalid session payload')
  }
  const r = raw as Record<string, unknown>
  const role = r.role
  if (!isUserRole(role)) {
    throw new Error(`invalid session role: ${String(role)}`)
  }
  const parsedRole: UserRole = role
  const id = requireString(r.id, 'id')
  const userId = requireString(r.userId, 'userId')
  const email = requireString(r.email, 'email')
  const createdAt = requireDate(r.createdAt, 'createdAt')
  const expiresAt = requireDate(r.expiresAt, 'expiresAt')
  const lastAccessAt = requireDate(r.lastAccessAt, 'lastAccessAt')
  const ipAddress = optionalString(r.ipAddress)
  const userAgent = optionalString(r.userAgent)
  return {
    id,
    userId,
    role: parsedRole,
    email,
    createdAt,
    expiresAt,
    lastAccessAt,
    ipAddress,
    userAgent,
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`invalid session field "${field}": expected string`)
  }
  return value
}

function requireDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new Error(`invalid session field "${field}": expected ISO date string`)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid session field "${field}": unparseable date`)
  }
  return date
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function cloneSession(session: Session): Session {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
    lastAccessAt: new Date(session.lastAccessAt),
  }
}

/**
 * 期限 / アイドル判定。無効な場合は例外を throw する。
 * 有効な場合は何もしない。
 */
function assertSessionLive(session: Session, now: Date, idleTtlMs: number): void {
  if (now.getTime() > session.expiresAt.getTime()) {
    throw new SessionExpiredError()
  }
  if (now.getTime() - session.lastAccessAt.getTime() > idleTtlMs) {
    throw new SessionIdleTimeoutError()
  }
}

/** Redis EXPIRE に渡す残り秒 (最小 1 秒) */
function remainingTtlSeconds(expiresAt: Date, now: Date): number {
  const remainingMs = expiresAt.getTime() - now.getTime()
  if (remainingMs <= 0) return 1
  return Math.max(1, Math.ceil(remainingMs / 1000))
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis SessionStore
// ─────────────────────────────────────────────────────────────────────────────

export interface RedisSessionStoreDeps {
  readonly redis: Redis
  readonly absoluteTtlMs?: number
  readonly idleTtlMs?: number
  readonly clock?: () => Date
}

class RedisSessionStore implements SessionStore {
  private readonly redis: Redis
  private readonly idleTtlMs: number
  private readonly clock: () => Date

  constructor(deps: RedisSessionStoreDeps) {
    this.redis = deps.redis
    this.idleTtlMs = deps.idleTtlMs ?? SESSION_IDLE_TTL_MS
    this.clock = deps.clock ?? (() => new Date())
  }

  /** sadd が利用可能な場合のみ呼び出す (後方互換のためフェールセーフ) */
  private async trySadd(key: string, member: string): Promise<void> {
    if (typeof (this.redis as unknown as Record<string, unknown>).sadd === 'function') {
      await this.redis.sadd(key, member)
    }
  }

  /** srem が利用可能な場合のみ呼び出す */
  private async trySrem(key: string, member: string): Promise<void> {
    if (typeof (this.redis as unknown as Record<string, unknown>).srem === 'function') {
      await this.redis.srem(key, member)
    }
  }

  /** smembers が利用可能な場合のみ呼び出す。未対応なら空配列を返す */
  private async trySmembers(key: string): Promise<string[]> {
    if (typeof (this.redis as unknown as Record<string, unknown>).smembers === 'function') {
      return this.redis.smembers(key)
    }
    return []
  }

  async create(session: Session): Promise<void> {
    const now = this.clock()
    const ttl = remainingTtlSeconds(session.expiresAt, now)
    const payload = JSON.stringify(serializeSession(session))
    await this.redis.set(sessionKey(session.id), payload, 'EX', ttl)
    await this.trySadd(userSessionsKey(session.userId), session.id)
  }

  async get(sessionId: string, now: Date): Promise<Session> {
    const raw = await this.redis.get(sessionKey(sessionId))
    if (raw === null) {
      throw new SessionNotFoundError(sessionId)
    }
    const parsed = this.parseOrThrow(raw, sessionId)
    try {
      assertSessionLive(parsed, now, this.idleTtlMs)
    } catch (error: unknown) {
      await this.redis.del(sessionKey(sessionId))
      throw error
    }
    return parsed
  }

  async touch(sessionId: string, now: Date): Promise<Session> {
    const current = await this.get(sessionId, now)
    const updated: Session = { ...current, lastAccessAt: new Date(now) }
    const ttl = remainingTtlSeconds(updated.expiresAt, now)
    await this.redis.set(
      sessionKey(sessionId),
      JSON.stringify(serializeSession(updated)),
      'EX',
      ttl,
    )
    return updated
  }

  async delete(sessionId: string): Promise<void> {
    // 削除前にセッションを読み、userId を取得してセカンダリインデックスからも除去する。
    // セッションが存在しない場合は単純に del するだけで OK。
    const raw = await this.redis.get(sessionKey(sessionId))
    if (raw !== null) {
      try {
        const parsed = deserializeSession(JSON.parse(raw))
        await this.trySrem(userSessionsKey(parsed.userId), sessionId)
      } catch {
        // 破損ペイロードはインデックス除去をスキップ
      }
    }
    await this.redis.del(sessionKey(sessionId))
  }

  async listByUser(userId: string): Promise<readonly Session[]> {
    const sessionIds = await this.trySmembers(userSessionsKey(userId))
    const sessions: Session[] = []
    for (const id of sessionIds) {
      const raw = await this.redis.get(sessionKey(id))
      if (raw === null) {
        // 期限切れや手動削除で存在しない場合はセットからも除去してスキップ
        await this.trySrem(userSessionsKey(userId), id)
        continue
      }
      try {
        sessions.push(deserializeSession(JSON.parse(raw)))
      } catch {
        // 破損ペイロードはスキップ
      }
    }
    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  private parseOrThrow(raw: string, sessionId: string): Session {
    try {
      return deserializeSession(JSON.parse(raw))
    } catch {
      // 破損ペイロードは掃除して NotFound 扱いにする
      void this.redis.del(sessionKey(sessionId))
      throw new SessionNotFoundError(sessionId)
    }
  }
}

export function createRedisSessionStore(deps: RedisSessionStoreDeps): SessionStore {
  return new RedisSessionStore(deps)
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory SessionStore
// ─────────────────────────────────────────────────────────────────────────────

export interface InMemorySessionStoreOptions {
  readonly absoluteTtlMs?: number
  readonly idleTtlMs?: number
}

class InMemorySessionStore implements SessionStore {
  private readonly store: Map<string, Session>
  private readonly idleTtlMs: number

  constructor(opts?: InMemorySessionStoreOptions) {
    this.store = new Map()
    this.idleTtlMs = opts?.idleTtlMs ?? SESSION_IDLE_TTL_MS
  }

  async create(session: Session): Promise<void> {
    this.store.set(session.id, cloneSession(session))
  }

  async get(sessionId: string, now: Date): Promise<Session> {
    const found = this.store.get(sessionId)
    if (!found) {
      throw new SessionNotFoundError(sessionId)
    }
    try {
      assertSessionLive(found, now, this.idleTtlMs)
    } catch (error: unknown) {
      this.store.delete(sessionId)
      throw error
    }
    return cloneSession(found)
  }

  async touch(sessionId: string, now: Date): Promise<Session> {
    const current = await this.get(sessionId, now)
    const updated: Session = { ...current, lastAccessAt: new Date(now) }
    this.store.set(sessionId, cloneSession(updated))
    return cloneSession(updated)
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId)
  }

  async listByUser(userId: string): Promise<readonly Session[]> {
    const result: Session[] = []
    for (const session of this.store.values()) {
      if (session.userId === userId) {
        result.push(cloneSession(session))
      }
    }
    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }
}

export function createInMemorySessionStore(opts?: InMemorySessionStoreOptions): SessionStore {
  return new InMemorySessionStore(opts)
}
