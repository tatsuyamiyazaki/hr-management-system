/**
 * Task 6.1: AuthUserRepository (InMemory) の単体テスト
 */
import { describe, it, expect } from 'vitest'
import { createInMemoryAuthUserRepository, type AuthUserRecord } from '@/lib/auth/user-repository'

function makeUser(overrides?: Partial<AuthUserRecord>): AuthUserRecord {
  return {
    id: 'user-1',
    emailHash: 'a'.repeat(64),
    email: 'alice@example.com',
    passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('createInMemoryAuthUserRepository', () => {
  it('seed が空の場合は null を返す', async () => {
    const repo = createInMemoryAuthUserRepository()
    await expect(repo.findByEmailHash('missing')).resolves.toBeNull()
    await expect(repo.findById('missing')).resolves.toBeNull()
  })

  it('findByEmailHash でシードされたユーザーを取得できる', async () => {
    const alice = makeUser({ id: 'u-alice', emailHash: 'h-alice' })
    const bob = makeUser({ id: 'u-bob', emailHash: 'h-bob', email: 'bob@example.com' })
    const repo = createInMemoryAuthUserRepository([alice, bob])

    const found = await repo.findByEmailHash('h-alice')
    expect(found?.id).toBe('u-alice')
    expect(found?.email).toBe('alice@example.com')
  })

  it('存在しない emailHash は null', async () => {
    const repo = createInMemoryAuthUserRepository([makeUser()])
    await expect(repo.findByEmailHash('no-match')).resolves.toBeNull()
  })

  it('findById で取得できる', async () => {
    const user = makeUser({ id: 'u-42', emailHash: 'h-42' })
    const repo = createInMemoryAuthUserRepository([user])
    const found = await repo.findById('u-42')
    expect(found?.emailHash).toBe('h-42')
  })

  it('存在しない id は null', async () => {
    const repo = createInMemoryAuthUserRepository([makeUser()])
    await expect(repo.findById('ghost')).resolves.toBeNull()
  })

  it('返されたレコードを変更しても内部状態は変わらない (防御的コピー)', async () => {
    const repo = createInMemoryAuthUserRepository([makeUser({ id: 'u-1', emailHash: 'h-1' })])
    const first = await repo.findById('u-1')
    expect(first).not.toBeNull()
    // 返却値を改変
    ;(first as { email: string }).email = 'hacked@example.com'
    const second = await repo.findById('u-1')
    expect(second?.email).toBe('alice@example.com')
  })
})
