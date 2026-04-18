/**
 * Issue #34 / Req 16.6: 検索専用レート制限
 *
 * スライディングウィンドウ方式のレート制限。
 * 60 req/min/user を保護する。
 *
 * プロダクション環境では Redis 実装を提供するが、
 * 本モジュールはインターフェースとインメモリ実装のみを定義する。
 */
import { SEARCH_RATE_LIMIT_MAX, SEARCH_RATE_LIMIT_WINDOW_SEC } from './search-types'

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchRateLimitResult {
  readonly allowed: boolean
  readonly remaining: number
  readonly retryAfterSec: number
}

/**
 * 検索レート制限のポート。
 * Service 層はこのインターフェースに依存し、実装は DI で注入する。
 */
export interface SearchRateLimiter {
  /**
   * 指定ユーザーのリクエストを記録し、制限内かどうか判定する。
   * @param userId ユーザー ID
   * @returns レート制限結果
   */
  check(userId: string): Promise<SearchRateLimitResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory implementation (テスト・開発用)
// ─────────────────────────────────────────────────────────────────────────────

interface WindowEntry {
  timestamps: number[]
}

/**
 * インメモリスライディングウィンドウ実装。
 * テスト・ローカル開発で Redis が不要な場合に使用する。
 */
export class InMemorySearchRateLimiter implements SearchRateLimiter {
  private readonly store = new Map<string, WindowEntry>()
  private readonly maxRequests: number
  private readonly windowSec: number
  private readonly nowFn: () => number

  constructor(opts?: { maxRequests?: number; windowSec?: number; nowFn?: () => number }) {
    this.maxRequests = opts?.maxRequests ?? SEARCH_RATE_LIMIT_MAX
    this.windowSec = opts?.windowSec ?? SEARCH_RATE_LIMIT_WINDOW_SEC
    this.nowFn = opts?.nowFn ?? (() => Date.now())
  }

  async check(userId: string): Promise<SearchRateLimitResult> {
    const now = this.nowFn()
    const windowStart = now - this.windowSec * 1000

    let entry = this.store.get(userId)
    if (!entry) {
      entry = { timestamps: [] }
      this.store.set(userId, entry)
    }

    // ウィンドウ外のタイムスタンプを除去
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)

    if (entry.timestamps.length >= this.maxRequests) {
      // 最も古いタイムスタンプからリトライ可能時間を計算
      const oldestInWindow = entry.timestamps[0] ?? now
      const retryAfterMs = oldestInWindow + this.windowSec * 1000 - now
      const retryAfterSec = Math.ceil(retryAfterMs / 1000)

      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(retryAfterSec, 1),
      }
    }

    entry.timestamps.push(now)

    return {
      allowed: true,
      remaining: this.maxRequests - entry.timestamps.length,
      retryAfterSec: 0,
    }
  }
}
