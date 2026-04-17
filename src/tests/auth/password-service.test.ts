/**
 * Task 6.2 / Req 1.12, 1.13: PasswordService.changePassword の単体テスト
 *
 * 依存はフェイクに差し替えて呼び出し順序と失敗経路を厳密に検証する。
 */
import { describe, expect, it, vi } from 'vitest'
import { PasswordPolicyViolationError } from '@/lib/auth/auth-types'
import type { PasswordHasher } from '@/lib/auth/password-hasher'
import {
  createInMemoryPasswordHistoryRepository,
  type PasswordHistoryRepository,
} from '@/lib/auth/password-history-repository'
import { createPasswordService, type PasswordPersistencePort } from '@/lib/auth/password-service'

const VALID_PASSWORD = 'Abcdefghij1!' // 12 文字 / 4 クラス

interface TrackingPersist extends PasswordPersistencePort {
  readonly calls: ReadonlyArray<readonly [string, string]>
}

function createTrackingPersist(): TrackingPersist {
  const calls: Array<readonly [string, string]> = []
  return {
    async updateUserPasswordHash(userId: string, newHash: string): Promise<void> {
      calls.push([userId, newHash])
    },
    get calls(): ReadonlyArray<readonly [string, string]> {
      return calls
    },
  }
}

function createFakeHasher(): PasswordHasher {
  return {
    hash: vi.fn(async (plain: string) => `hashed(${plain})`),
    verify: vi.fn(async (plain: string, hash: string) => hash === `hashed(${plain})`),
  }
}

describe('createPasswordService.changePassword', () => {
  it('正常変更: listRecent → hash → persist → history.add の順で newHash を返す', async () => {
    const callLog: string[] = []
    const hasher: PasswordHasher = {
      hash: vi.fn(async (plain: string) => {
        callLog.push('hash')
        return `hashed(${plain})`
      }),
      verify: vi.fn(async () => {
        callLog.push('verify')
        return false
      }),
    }
    const history: PasswordHistoryRepository = {
      listRecent: vi.fn(async () => {
        callLog.push('listRecent')
        return []
      }),
      add: vi.fn(async () => {
        callLog.push('add')
      }),
    }
    const persist: PasswordPersistencePort = {
      updateUserPasswordHash: vi.fn(async () => {
        callLog.push('persist')
      }),
    }

    const service = createPasswordService({
      hasher,
      history,
      persist,
      clock: () => new Date('2026-04-17T00:00:00.000Z'),
    })

    const result = await service.changePassword({
      userId: 'user-1',
      newPassword: VALID_PASSWORD,
    })

    expect(result.newHash).toBe(`hashed(${VALID_PASSWORD})`)
    // 履歴が空なので verify は呼ばれない
    expect(callLog).toEqual(['listRecent', 'hash', 'persist', 'add'])
  })

  it('LENGTH 違反時は persist / history.add / hash を呼ばない', async () => {
    const hasher = createFakeHasher()
    const history = createInMemoryPasswordHistoryRepository()
    const historyAddSpy = vi.spyOn(history, 'add')
    const persist = createTrackingPersist()
    const service = createPasswordService({ hasher, history, persist })

    await expect(
      service.changePassword({ userId: 'user-1', newPassword: 'Short1!' }),
    ).rejects.toMatchObject({ name: 'PasswordPolicyViolationError', rule: 'LENGTH' })

    expect(persist.calls).toHaveLength(0)
    expect(historyAddSpy).not.toHaveBeenCalled()
    expect(hasher.hash).not.toHaveBeenCalled()
  })

  it('COMPLEXITY 違反時は persist / history.add / hash を呼ばない', async () => {
    const hasher = createFakeHasher()
    const history = createInMemoryPasswordHistoryRepository()
    const historyAddSpy = vi.spyOn(history, 'add')
    const persist = createTrackingPersist()
    const service = createPasswordService({ hasher, history, persist })

    try {
      await service.changePassword({ userId: 'user-1', newPassword: 'abcdefghijklmn' })
      throw new Error('should have thrown')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PasswordPolicyViolationError)
      if (error instanceof PasswordPolicyViolationError) {
        expect(error.rule).toBe('COMPLEXITY')
      }
    }

    expect(persist.calls).toHaveLength(0)
    expect(historyAddSpy).not.toHaveBeenCalled()
    expect(hasher.hash).not.toHaveBeenCalled()
  })

  it('過去履歴と一致したら REUSED で拒否 (persist / add は呼ばれない)', async () => {
    const history = createInMemoryPasswordHistoryRepository([
      {
        userId: 'user-1',
        hash: `hashed(${VALID_PASSWORD})`,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ])
    const historyAddSpy = vi.spyOn(history, 'add')
    const hasher = createFakeHasher()
    const persist = createTrackingPersist()
    const service = createPasswordService({ hasher, history, persist })

    try {
      await service.changePassword({ userId: 'user-1', newPassword: VALID_PASSWORD })
      throw new Error('should have thrown')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PasswordPolicyViolationError)
      if (error instanceof PasswordPolicyViolationError) {
        expect(error.rule).toBe('REUSED')
      }
    }

    expect(persist.calls).toHaveLength(0)
    expect(historyAddSpy).not.toHaveBeenCalled()
    // verify は最低 1 回呼ばれている (履歴チェック)
    expect(hasher.verify).toHaveBeenCalled()
  })

  it('履歴が空なら verify スキップ, 正常変更が成立', async () => {
    const hasher = createFakeHasher()
    const history = createInMemoryPasswordHistoryRepository()
    const persist = createTrackingPersist()
    const service = createPasswordService({ hasher, history, persist })

    await service.changePassword({ userId: 'user-1', newPassword: VALID_PASSWORD })

    expect(hasher.verify).not.toHaveBeenCalled()
    expect(hasher.hash).toHaveBeenCalledTimes(1)
    expect(persist.calls).toHaveLength(1)
  })

  it('履歴にあるが一致しないものはスキップされ、正常変更が成立する', async () => {
    const history = createInMemoryPasswordHistoryRepository([
      {
        userId: 'user-1',
        hash: 'hashed(OldPassw0rd!!!)',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ])
    const historyAddSpy = vi.spyOn(history, 'add')
    const hasher = createFakeHasher()
    const persist = createTrackingPersist()
    const service = createPasswordService({ hasher, history, persist })

    const result = await service.changePassword({
      userId: 'user-1',
      newPassword: VALID_PASSWORD,
    })
    expect(result.newHash).toBe(`hashed(${VALID_PASSWORD})`)
    expect(persist.calls).toEqual([['user-1', `hashed(${VALID_PASSWORD})`]])
    expect(historyAddSpy).toHaveBeenCalledTimes(1)
  })

  it('clock 未指定でも例外なく完了する (Date.now() フォールバック)', async () => {
    const hasher = createFakeHasher()
    const history = createInMemoryPasswordHistoryRepository()
    const persist = createTrackingPersist()
    const service = createPasswordService({ hasher, history, persist })
    await expect(
      service.changePassword({ userId: 'user-1', newPassword: VALID_PASSWORD }),
    ).resolves.toBeDefined()
  })
})
