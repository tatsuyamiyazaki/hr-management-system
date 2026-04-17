import { describe, it, expect } from 'vitest'
import {
  createInMemoryBroadcastTargetResolver,
  type BroadcastRecipient,
} from '@/lib/notification/broadcast-target-resolver'
import { BroadcastGroupNotFoundError } from '@/lib/notification/custom-broadcast-service'

const USERS: readonly BroadcastRecipient[] = [
  { userId: 'u1', email: 'u1@example.com' },
  { userId: 'u2', email: 'u2@example.com' },
  { userId: 'u3', email: 'u3@example.com' },
]

const GROUP_A: readonly BroadcastRecipient[] = [
  { userId: 'u1', email: 'u1@example.com' },
  { userId: 'u2', email: 'u2@example.com' },
]

describe('InMemoryBroadcastTargetResolver', () => {
  function seed() {
    return {
      allUsers: USERS,
      groups: new Map<string, readonly BroadcastRecipient[]>([['group-a', GROUP_A]]),
    }
  }

  it('returns all users when target.type = ALL', async () => {
    const resolver = createInMemoryBroadcastTargetResolver(seed())
    const result = await resolver.resolve({ type: 'ALL' })
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.userId).sort()).toEqual(['u1', 'u2', 'u3'])
  })

  it('returns group members when target.type = GROUP with known groupId', async () => {
    const resolver = createInMemoryBroadcastTargetResolver(seed())
    const result = await resolver.resolve({ type: 'GROUP', groupId: 'group-a' })
    expect(result.map((r) => r.userId).sort()).toEqual(['u1', 'u2'])
  })

  it('throws BroadcastGroupNotFoundError for unknown groupId', async () => {
    const resolver = createInMemoryBroadcastTargetResolver(seed())
    await expect(resolver.resolve({ type: 'GROUP', groupId: 'nope' })).rejects.toBeInstanceOf(
      BroadcastGroupNotFoundError,
    )
  })

  it('returns an empty array when allUsers seed is empty (ALL target)', async () => {
    const resolver = createInMemoryBroadcastTargetResolver({
      allUsers: [],
      groups: new Map(),
    })
    const result = await resolver.resolve({ type: 'ALL' })
    expect(result).toHaveLength(0)
  })

  it('returns a fresh array on each call (no shared reference)', async () => {
    const resolver = createInMemoryBroadcastTargetResolver(seed())
    const first = await resolver.resolve({ type: 'ALL' })
    const second = await resolver.resolve({ type: 'ALL' })
    expect(first).not.toBe(second)
    expect(second).toHaveLength(3)
  })
})
