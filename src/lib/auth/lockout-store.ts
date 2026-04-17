/**
 * Task 6.2 / Req 1.3: アカウントロックアウトストア
 *
 * 連続ログイン失敗を追跡し、規定回数に達したら一定時間ロックする。
 * InMemory 実装 (テスト / ローカル dev) と Redis 実装 (本番) を提供する。
 *
 * AuthService からは optional で注入され、未指定時はロック無効 (後方互換)。
 */
import type { Redis } from 'ioredis'

/** Req 1.3: 連続失敗の上限 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5

/** Req 1.3: ロック持続時間 (15 分) */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000

const LOCKOUT_KEY_PREFIX = 'auth:lockout:'

function lockoutKey(userId: string): string {
  return `${LOCKOUT_KEY_PREFIX}${userId}`
}

export interface LockoutStatus {
  readonly userId: string
  readonly failedCount: number
  readonly lockedUntil: Date | null
}

export interface LockoutStore {
  /**
   * 現在のロック状態を返す。
   * 既にロック期限が過ぎている場合は自動的に解除済み状態を返す。
   */
  get(userId: string, now: Date): Promise<LockoutStatus>
  /**
   * 失敗を 1 件記録し、更新後の状態を返す。
   * - 現在ロック中の場合は status は変化しない (再度のカウントアップはしない)。
   * - failedCount が maxAttempts に達した瞬間、lockedUntil = now + lockoutDurationMs を設定する。
   */
  recordFailure(userId: string, now: Date): Promise<LockoutStatus>
  /** 成功ログインなどでカウンタとロックを完全リセットする */
  reset(userId: string): Promise<void>
}

interface LockoutStoreOptions {
  readonly maxAttempts?: number
  readonly lockoutDurationMs?: number
}

function emptyStatus(userId: string): LockoutStatus {
  return { userId, failedCount: 0, lockedUntil: null }
}

function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime()
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory implementation
// ─────────────────────────────────────────────────────────────────────────────

interface MutableEntry {
  failedCount: number
  lockedUntil: Date | null
}

class InMemoryLockoutStore implements LockoutStore {
  private readonly store: Map<string, MutableEntry>
  private readonly maxAttempts: number
  private readonly lockoutDurationMs: number

  constructor(opts?: LockoutStoreOptions) {
    this.store = new Map()
    this.maxAttempts = opts?.maxAttempts ?? MAX_FAILED_LOGIN_ATTEMPTS
    this.lockoutDurationMs = opts?.lockoutDurationMs ?? LOCKOUT_DURATION_MS
  }

  async get(userId: string, now: Date): Promise<LockoutStatus> {
    const entry = this.store.get(userId)
    if (!entry) {
      return emptyStatus(userId)
    }
    // ロック期限が過ぎていたら自動解除
    if (entry.lockedUntil !== null && entry.lockedUntil.getTime() <= now.getTime()) {
      this.store.delete(userId)
      return emptyStatus(userId)
    }
    return {
      userId,
      failedCount: entry.failedCount,
      lockedUntil: entry.lockedUntil ? new Date(entry.lockedUntil) : null,
    }
  }

  async recordFailure(userId: string, now: Date): Promise<LockoutStatus> {
    // 期限切れ反映済みの status を取得
    const current = await this.get(userId, now)

    // 現在ロック中は何もしない
    if (isLocked(current.lockedUntil, now)) {
      return current
    }

    const nextCount = current.failedCount + 1
    const reachedThreshold = nextCount >= this.maxAttempts
    const lockedUntil = reachedThreshold ? new Date(now.getTime() + this.lockoutDurationMs) : null

    this.store.set(userId, { failedCount: nextCount, lockedUntil })
    return { userId, failedCount: nextCount, lockedUntil }
  }

  async reset(userId: string): Promise<void> {
    this.store.delete(userId)
  }
}

export function createInMemoryLockoutStore(opts?: LockoutStoreOptions): LockoutStore {
  return new InMemoryLockoutStore(opts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis implementation
// ─────────────────────────────────────────────────────────────────────────────

interface SerializedLockoutEntry {
  readonly failedCount: number
  /** ISO-8601 string or null */
  readonly lockedUntil: string | null
}

function serializeEntry(entry: MutableEntry): string {
  const payload: SerializedLockoutEntry = {
    failedCount: entry.failedCount,
    lockedUntil: entry.lockedUntil ? entry.lockedUntil.toISOString() : null,
  }
  return JSON.stringify(payload)
}

function deserializeEntry(raw: string): MutableEntry | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    const failedCount = obj.failedCount
    const lockedUntilRaw = obj.lockedUntil
    if (typeof failedCount !== 'number' || !Number.isFinite(failedCount)) return null
    if (lockedUntilRaw !== null && typeof lockedUntilRaw !== 'string') return null
    let lockedUntil: Date | null = null
    if (typeof lockedUntilRaw === 'string') {
      const parsedDate = new Date(lockedUntilRaw)
      if (Number.isNaN(parsedDate.getTime())) return null
      lockedUntil = parsedDate
    }
    return { failedCount, lockedUntil }
  } catch {
    return null
  }
}

export interface RedisLockoutStoreDeps {
  readonly redis: Redis
  readonly maxAttempts?: number
  readonly lockoutDurationMs?: number
}

class RedisLockoutStore implements LockoutStore {
  private readonly redis: Redis
  private readonly maxAttempts: number
  private readonly lockoutDurationMs: number

  constructor(deps: RedisLockoutStoreDeps) {
    this.redis = deps.redis
    this.maxAttempts = deps.maxAttempts ?? MAX_FAILED_LOGIN_ATTEMPTS
    this.lockoutDurationMs = deps.lockoutDurationMs ?? LOCKOUT_DURATION_MS
  }

  async get(userId: string, now: Date): Promise<LockoutStatus> {
    const raw = await this.redis.get(lockoutKey(userId))
    if (raw === null) return emptyStatus(userId)

    const entry = deserializeEntry(raw)
    if (!entry) {
      // 破損ペイロードは削除して空を返す
      await this.redis.del(lockoutKey(userId))
      return emptyStatus(userId)
    }

    if (entry.lockedUntil !== null && entry.lockedUntil.getTime() <= now.getTime()) {
      await this.redis.del(lockoutKey(userId))
      return emptyStatus(userId)
    }

    return {
      userId,
      failedCount: entry.failedCount,
      lockedUntil: entry.lockedUntil,
    }
  }

  async recordFailure(userId: string, now: Date): Promise<LockoutStatus> {
    const current = await this.get(userId, now)
    if (isLocked(current.lockedUntil, now)) {
      return current
    }
    const nextCount = current.failedCount + 1
    const reachedThreshold = nextCount >= this.maxAttempts
    const lockedUntil = reachedThreshold ? new Date(now.getTime() + this.lockoutDurationMs) : null
    const serialized = serializeEntry({ failedCount: nextCount, lockedUntil })
    // TTL は lockoutDurationMs ミリ秒 (秒単位に切り上げ)
    const ttlSec = Math.max(1, Math.ceil(this.lockoutDurationMs / 1000))
    await this.redis.set(lockoutKey(userId), serialized, 'EX', ttlSec)
    return { userId, failedCount: nextCount, lockedUntil }
  }

  async reset(userId: string): Promise<void> {
    await this.redis.del(lockoutKey(userId))
  }
}

export function createRedisLockoutStore(deps: RedisLockoutStoreDeps): LockoutStore {
  return new RedisLockoutStore(deps)
}
