/**
 * AIResponseCache
 *
 * AI プロバイダ呼び出しのレスポンスをキャッシュするモジュール。
 * 同一入力 (provider|domain|messages) に対して Redis にキャッシュし、
 * コスト削減と応答時間短縮を実現する (Req 19.8)。
 *
 * 実装:
 *  - Redis 実装 (本番): ioredis クライアント + SETEX で TTL 付き保存
 *  - InMemory 実装 (テスト用・Redis 未設定フォールバック): Map + ソフト TTL
 *
 * キャッシュキー:
 *  - 呼び出し側 (ai-gateway) で `${provider}|${domain}|${messagesJson}` を生成し、
 *    本モジュール内で sha256 ハッシュ化して `ai:cache:<hash>` の形に整形する。
 */
import { createHash } from 'node:crypto'
import type { Redis } from 'ioredis'

import type { AIChatResponse } from './ai-gateway-types'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** Redis キー名前空間プレフィックス */
const CACHE_KEY_PREFIX = 'ai:cache:'

/** デフォルト TTL (5 分) */
export const DEFAULT_AI_CACHE_TTL_SECONDS = 300

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AIResponseCache {
  /** キャッシュ取得。ヒット時は cached:true が注入されたレスポンスを返す */
  get(key: string): Promise<AIChatResponse | null>
  /** キャッシュ保存。TTL 省略時はデフォルト TTL を使用 */
  set(key: string, response: AIChatResponse, ttlSeconds?: number): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// 共通ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

/** 入力文字列を sha256 ハッシュ化し、キャッシュキー形式に整形 */
export function buildCacheKey(rawKey: string): string {
  const hash = createHash('sha256').update(rawKey).digest('hex')
  return `${CACHE_KEY_PREFIX}${hash}`
}

/** JSON シリアライズ時の失敗を吸収して null を返す */
function tryParseResponse(raw: string): AIChatResponse | null {
  try {
    const parsed = JSON.parse(raw) as AIChatResponse
    return { ...parsed, cached: true }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis 実装
// ─────────────────────────────────────────────────────────────────────────────

class RedisAIResponseCache implements AIResponseCache {
  private readonly redis: Redis
  private readonly defaultTtl: number

  constructor(redis: Redis, defaultTtl: number) {
    this.redis = redis
    this.defaultTtl = defaultTtl
  }

  async get(key: string): Promise<AIChatResponse | null> {
    const redisKey = buildCacheKey(key)
    const raw = await this.redis.get(redisKey)
    if (raw === null) return null
    return tryParseResponse(raw)
  }

  async set(
    key: string,
    response: AIChatResponse,
    ttlSeconds: number = this.defaultTtl,
  ): Promise<void> {
    const redisKey = buildCacheKey(key)
    // cached フラグはキャッシュ読込側で付与するため、保存時は false を正規化して保存
    const payload = JSON.stringify({ ...response, cached: false })
    await this.redis.setex(redisKey, ttlSeconds, payload)
  }
}

/** Redis クライアントをラップしたキャッシュを生成する */
export function createRedisAIResponseCache(
  redis: Redis,
  defaultTtlSeconds: number = DEFAULT_AI_CACHE_TTL_SECONDS,
): AIResponseCache {
  return new RedisAIResponseCache(redis, defaultTtlSeconds)
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory 実装
// ─────────────────────────────────────────────────────────────────────────────

interface InMemoryEntry {
  readonly response: AIChatResponse
  readonly expiresAt: number // epoch millis
}

class InMemoryAIResponseCache implements AIResponseCache {
  private readonly store = new Map<string, InMemoryEntry>()
  private readonly clock: () => number

  constructor(clock: () => number) {
    this.clock = clock
  }

  async get(key: string): Promise<AIChatResponse | null> {
    const redisKey = buildCacheKey(key)
    const entry = this.store.get(redisKey)
    if (!entry) return null
    if (entry.expiresAt <= this.clock()) {
      this.store.delete(redisKey)
      return null
    }
    return { ...entry.response, cached: true }
  }

  async set(
    key: string,
    response: AIChatResponse,
    ttlSeconds: number = DEFAULT_AI_CACHE_TTL_SECONDS,
  ): Promise<void> {
    const redisKey = buildCacheKey(key)
    this.store.set(redisKey, {
      response: { ...response, cached: false },
      expiresAt: this.clock() + ttlSeconds * 1000,
    })
  }
}

/**
 * In-memory キャッシュを生成する (テスト・Redis 未設定時のフォールバック用)。
 * clock() は現在時刻ミリ秒を返す関数。テストでは Date.now() 以外を差し込める。
 */
export function createInMemoryAIResponseCache(
  clock: () => number = () => Date.now(),
): AIResponseCache {
  return new InMemoryAIResponseCache(clock)
}
