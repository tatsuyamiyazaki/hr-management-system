/**
 * Issue #34 / Req 16.6: 検索レート制限の単体テスト
 *
 * InMemorySearchRateLimiter のスライディングウィンドウ方式を検証する:
 * - 制限内リクエストの許可
 * - 制限超過時の拒否
 * - ウィンドウ経過後のリセット
 * - ユーザー間の独立性
 */
import { describe, it, expect } from 'vitest'
import { InMemorySearchRateLimiter } from '@/lib/search/search-rate-limiter'

describe('InMemorySearchRateLimiter', () => {
  it('制限内のリクエストは許可される', async () => {
    const limiter = new InMemorySearchRateLimiter({ maxRequests: 3, windowSec: 60 })

    const r1 = await limiter.check('user-1')
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(2)
    expect(r1.retryAfterSec).toBe(0)

    const r2 = await limiter.check('user-1')
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(1)

    const r3 = await limiter.check('user-1')
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('制限超過時は拒否される', async () => {
    const limiter = new InMemorySearchRateLimiter({ maxRequests: 2, windowSec: 60 })

    await limiter.check('user-1')
    await limiter.check('user-1')

    const r3 = await limiter.check('user-1')
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
    expect(r3.retryAfterSec).toBeGreaterThan(0)
  })

  it('ウィンドウ経過後はリセットされる', async () => {
    let now = 1000000
    const limiter = new InMemorySearchRateLimiter({
      maxRequests: 2,
      windowSec: 60,
      nowFn: () => now,
    })

    await limiter.check('user-1')
    await limiter.check('user-1')

    // 制限超過
    const blocked = await limiter.check('user-1')
    expect(blocked.allowed).toBe(false)

    // 60 秒経過
    now += 61_000
    const afterWindow = await limiter.check('user-1')
    expect(afterWindow.allowed).toBe(true)
    expect(afterWindow.remaining).toBe(1)
  })

  it('異なるユーザーは独立してカウントされる', async () => {
    const limiter = new InMemorySearchRateLimiter({ maxRequests: 1, windowSec: 60 })

    const r1 = await limiter.check('user-1')
    expect(r1.allowed).toBe(true)

    // user-1 は制限超過
    const r1b = await limiter.check('user-1')
    expect(r1b.allowed).toBe(false)

    // user-2 はまだ許可
    const r2 = await limiter.check('user-2')
    expect(r2.allowed).toBe(true)
  })

  it('retryAfterSec は最小 1 秒を返す', async () => {
    const now = 1000000
    const limiter = new InMemorySearchRateLimiter({
      maxRequests: 1,
      windowSec: 60,
      nowFn: () => now,
    })

    await limiter.check('user-1')

    const blocked = await limiter.check('user-1')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1)
  })

  it('デフォルト値で 60 req/min を設定する', async () => {
    const limiter = new InMemorySearchRateLimiter()

    // 60 リクエストは許可
    for (let i = 0; i < 60; i++) {
      const r = await limiter.check('user-1')
      expect(r.allowed).toBe(true)
    }

    // 61 番目は拒否
    const r61 = await limiter.check('user-1')
    expect(r61.allowed).toBe(false)
  })
})
