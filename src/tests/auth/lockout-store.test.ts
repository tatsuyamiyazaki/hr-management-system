/**
 * Task 6.2 / Req 1.3: InMemoryLockoutStore の単体テスト
 */
import { describe, expect, it } from 'vitest'
import {
  LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  createInMemoryLockoutStore,
} from '@/lib/auth/lockout-store'

const T0 = new Date('2026-04-17T00:00:00.000Z')
const afterMs = (base: Date, ms: number): Date => new Date(base.getTime() + ms)

describe('createInMemoryLockoutStore.get', () => {
  it('記録のない userId は失敗数 0 / 未ロック', async () => {
    const store = createInMemoryLockoutStore()
    const status = await store.get('user-1', T0)
    expect(status.failedCount).toBe(0)
    expect(status.lockedUntil).toBeNull()
  })

  it('ロック期限を過ぎた後の get は自動解除 (failedCount=0)', async () => {
    const store = createInMemoryLockoutStore()
    // 5 回失敗でロックさせる
    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await store.recordFailure('user-1', T0)
    }
    const lockedStatus = await store.get('user-1', T0)
    expect(lockedStatus.lockedUntil).toBeInstanceOf(Date)

    const afterExpire = afterMs(T0, LOCKOUT_DURATION_MS + 1000)
    const expiredStatus = await store.get('user-1', afterExpire)
    expect(expiredStatus.failedCount).toBe(0)
    expect(expiredStatus.lockedUntil).toBeNull()
  })
})

describe('createInMemoryLockoutStore.recordFailure', () => {
  it('4 回失敗: failedCount=4, lockedUntil=null', async () => {
    const store = createInMemoryLockoutStore()
    for (let i = 1; i <= 4; i += 1) {
      const status = await store.recordFailure('user-1', T0)
      expect(status.failedCount).toBe(i)
      expect(status.lockedUntil).toBeNull()
    }
  })

  it('5 回目でロック (lockedUntil = now + 15min)', async () => {
    const store = createInMemoryLockoutStore()
    for (let i = 0; i < 4; i += 1) {
      await store.recordFailure('user-1', T0)
    }
    const fifth = await store.recordFailure('user-1', T0)
    expect(fifth.failedCount).toBe(MAX_FAILED_LOGIN_ATTEMPTS)
    expect(fifth.lockedUntil).not.toBeNull()
    expect(fifth.lockedUntil?.getTime()).toBe(T0.getTime() + LOCKOUT_DURATION_MS)
  })

  it('ロック中の recordFailure は status を変更しない (カウントアップしない)', async () => {
    const store = createInMemoryLockoutStore()
    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await store.recordFailure('user-1', T0)
    }
    const locked = await store.get('user-1', T0)
    const duringLock = await store.recordFailure('user-1', afterMs(T0, 60_000))
    expect(duringLock.failedCount).toBe(locked.failedCount)
    expect(duringLock.lockedUntil?.getTime()).toBe(locked.lockedUntil?.getTime())
  })

  it('ユーザー毎にカウンタは独立', async () => {
    const store = createInMemoryLockoutStore()
    await store.recordFailure('user-a', T0)
    await store.recordFailure('user-a', T0)
    await store.recordFailure('user-b', T0)

    const a = await store.get('user-a', T0)
    const b = await store.get('user-b', T0)
    expect(a.failedCount).toBe(2)
    expect(b.failedCount).toBe(1)
  })
})

describe('createInMemoryLockoutStore.reset', () => {
  it('reset 後は failedCount=0 / lockedUntil=null', async () => {
    const store = createInMemoryLockoutStore()
    await store.recordFailure('user-1', T0)
    await store.recordFailure('user-1', T0)
    await store.reset('user-1')
    const status = await store.get('user-1', T0)
    expect(status.failedCount).toBe(0)
    expect(status.lockedUntil).toBeNull()
  })

  it('ロック中のユーザーも reset で完全クリアされる', async () => {
    const store = createInMemoryLockoutStore()
    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await store.recordFailure('user-1', T0)
    }
    await store.reset('user-1')
    const status = await store.get('user-1', T0)
    expect(status.failedCount).toBe(0)
    expect(status.lockedUntil).toBeNull()
  })
})

describe('createInMemoryLockoutStore options override', () => {
  it('maxAttempts を 3 に設定すると 3 回目でロック', async () => {
    const store = createInMemoryLockoutStore({ maxAttempts: 3 })
    await store.recordFailure('user-1', T0)
    await store.recordFailure('user-1', T0)
    const third = await store.recordFailure('user-1', T0)
    expect(third.lockedUntil).not.toBeNull()
  })

  it('lockoutDurationMs を上書きできる', async () => {
    const store = createInMemoryLockoutStore({ lockoutDurationMs: 60_000 })
    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await store.recordFailure('user-1', T0)
    }
    const status = await store.get('user-1', T0)
    expect(status.lockedUntil?.getTime()).toBe(T0.getTime() + 60_000)
  })
})
