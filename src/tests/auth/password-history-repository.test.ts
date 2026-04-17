/**
 * Task 6.2 / Req 1.13: InMemoryPasswordHistoryRepository の単体テスト
 */
import { describe, expect, it } from 'vitest'
import {
  createInMemoryPasswordHistoryRepository,
  type PasswordHistoryRecord,
} from '@/lib/auth/password-history-repository'
import { PASSWORD_HISTORY_SIZE } from '@/lib/auth/password-policy'

function makeRecord(hash: string, createdAt: Date, userId = 'user-1'): PasswordHistoryRecord {
  return { userId, hash, createdAt }
}

function recordAt(list: readonly PasswordHistoryRecord[], index: number): PasswordHistoryRecord {
  const record = list[index]
  if (!record) throw new Error(`no record at index ${index}`)
  return record
}

describe('createInMemoryPasswordHistoryRepository', () => {
  it('履歴がなければ listRecent は空配列', async () => {
    const repo = createInMemoryPasswordHistoryRepository()
    const recent = await repo.listRecent('user-1', PASSWORD_HISTORY_SIZE)
    expect(recent).toEqual([])
  })

  it('limit <= 0 は空配列', async () => {
    const repo = createInMemoryPasswordHistoryRepository([
      makeRecord('hash-a', new Date('2026-04-17T00:00:00.000Z')),
    ])
    expect(await repo.listRecent('user-1', 0)).toEqual([])
    expect(await repo.listRecent('user-1', -3)).toEqual([])
  })

  it('add で追加すると listRecent に反映される', async () => {
    const repo = createInMemoryPasswordHistoryRepository()
    await repo.add(makeRecord('hash-1', new Date('2026-04-17T00:00:00.000Z')))
    const recent = await repo.listRecent('user-1', PASSWORD_HISTORY_SIZE)
    expect(recent).toHaveLength(1)
    expect(recordAt(recent, 0).hash).toBe('hash-1')
  })

  it('listRecent は新しい順 (createdAt 降順) で返す', async () => {
    const repo = createInMemoryPasswordHistoryRepository()
    await repo.add(makeRecord('hash-old', new Date('2026-01-01T00:00:00.000Z')))
    await repo.add(makeRecord('hash-new', new Date('2026-03-01T00:00:00.000Z')))
    await repo.add(makeRecord('hash-mid', new Date('2026-02-01T00:00:00.000Z')))
    const recent = await repo.listRecent('user-1', PASSWORD_HISTORY_SIZE)
    expect(recent.map((r) => r.hash)).toEqual(['hash-new', 'hash-mid', 'hash-old'])
  })

  it('PASSWORD_HISTORY_SIZE を超えたら古いものが内部で剪定される', async () => {
    const repo = createInMemoryPasswordHistoryRepository()
    // 7 件追加 (PASSWORD_HISTORY_SIZE = 5)
    for (let i = 0; i < 7; i += 1) {
      const createdAt = new Date(`2026-04-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`)
      await repo.add(makeRecord(`hash-${i}`, createdAt))
    }
    const recent = await repo.listRecent('user-1', 100)
    expect(recent).toHaveLength(PASSWORD_HISTORY_SIZE)
    // 最新 5 件 (hash-2..hash-6) が残っている
    expect(recent.map((r) => r.hash)).toEqual(['hash-6', 'hash-5', 'hash-4', 'hash-3', 'hash-2'])
  })

  it('ユーザー毎に履歴が分離される', async () => {
    const repo = createInMemoryPasswordHistoryRepository()
    await repo.add(makeRecord('hash-a', new Date('2026-04-17T00:00:00.000Z'), 'user-A'))
    await repo.add(makeRecord('hash-b', new Date('2026-04-17T00:01:00.000Z'), 'user-B'))
    const aRecent = await repo.listRecent('user-A', PASSWORD_HISTORY_SIZE)
    const bRecent = await repo.listRecent('user-B', PASSWORD_HISTORY_SIZE)
    expect(aRecent).toHaveLength(1)
    expect(recordAt(aRecent, 0).hash).toBe('hash-a')
    expect(bRecent).toHaveLength(1)
    expect(recordAt(bRecent, 0).hash).toBe('hash-b')
  })

  it('seed で初期化し、保持数超過分は剪定される', async () => {
    const seed: PasswordHistoryRecord[] = []
    for (let i = 0; i < 8; i += 1) {
      seed.push(
        makeRecord(
          `seed-${i}`,
          new Date(`2026-04-${String(1 + i).padStart(2, '0')}T00:00:00.000Z`),
        ),
      )
    }
    const repo = createInMemoryPasswordHistoryRepository(seed)
    const recent = await repo.listRecent('user-1', 100)
    expect(recent).toHaveLength(PASSWORD_HISTORY_SIZE)
  })

  it('listRecent は内部状態と独立なコピーを返す (不変)', async () => {
    const repo = createInMemoryPasswordHistoryRepository()
    await repo.add(makeRecord('hash-z', new Date('2026-04-17T00:00:00.000Z')))
    const first = await repo.listRecent('user-1', PASSWORD_HISTORY_SIZE)
    // 戻り値を破壊しても内部データには影響しない
    recordAt(first, 0).createdAt.setFullYear(1900)
    const second = await repo.listRecent('user-1', PASSWORD_HISTORY_SIZE)
    expect(recordAt(second, 0).createdAt.getUTCFullYear()).toBe(2026)
  })
})
