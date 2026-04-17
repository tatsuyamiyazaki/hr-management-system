import { describe, it, expect } from 'vitest'
import {
  createInMemoryNotificationRepository,
  createInMemoryPreferenceRepository,
} from '@/lib/notification/notification-repository'
import type { Notification } from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// テストフィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: overrides.id ?? 'notif-1',
    userId: overrides.userId ?? 'user-1',
    category: overrides.category ?? 'SYSTEM',
    title: overrides.title ?? 'テスト通知',
    body: overrides.body ?? '本文',
    payload: overrides.payload ?? null,
    readAt: overrides.readAt ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-04-17T12:00:00Z'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemoryNotificationRepository
// ─────────────────────────────────────────────────────────────────────────────

describe('createInMemoryNotificationRepository', () => {
  describe('listByUser()', () => {
    it('should return empty array when no notifications exist', async () => {
      const repo = createInMemoryNotificationRepository()
      const result = await repo.listByUser('user-1')
      expect(result).toEqual([])
    })

    it('should return only notifications belonging to the specified user', async () => {
      const seed = [
        makeNotification({ id: 'a', userId: 'user-1' }),
        makeNotification({ id: 'b', userId: 'user-2' }),
        makeNotification({ id: 'c', userId: 'user-1' }),
      ]
      const repo = createInMemoryNotificationRepository(seed)
      const result = await repo.listByUser('user-1')
      expect(result).toHaveLength(2)
      expect(result.every((n) => n.userId === 'user-1')).toBe(true)
    })

    it('should return notifications sorted by createdAt descending', async () => {
      const seed = [
        makeNotification({ id: 'old', createdAt: new Date('2026-04-10T00:00:00Z') }),
        makeNotification({ id: 'newest', createdAt: new Date('2026-04-17T00:00:00Z') }),
        makeNotification({ id: 'middle', createdAt: new Date('2026-04-15T00:00:00Z') }),
      ]
      const repo = createInMemoryNotificationRepository(seed)
      const result = await repo.listByUser('user-1')
      expect(result.map((n) => n.id)).toEqual(['newest', 'middle', 'old'])
    })
  })

  describe('findById()', () => {
    it('should return the notification when it exists', async () => {
      const seed = [makeNotification({ id: 'target' })]
      const repo = createInMemoryNotificationRepository(seed)
      const result = await repo.findById('target')
      expect(result?.id).toBe('target')
    })

    it('should return null when notification does not exist', async () => {
      const repo = createInMemoryNotificationRepository()
      const result = await repo.findById('missing')
      expect(result).toBeNull()
    })
  })

  describe('markAsRead()', () => {
    it('should set readAt and return the updated notification', async () => {
      const seed = [makeNotification({ id: 'a', readAt: null })]
      const repo = createInMemoryNotificationRepository(seed)
      const readAt = new Date('2026-04-17T15:00:00Z')
      const updated = await repo.markAsRead('a', readAt)
      expect(updated?.readAt).toEqual(readAt)
    })

    it('should persist the readAt for subsequent reads', async () => {
      const seed = [makeNotification({ id: 'a', readAt: null })]
      const repo = createInMemoryNotificationRepository(seed)
      const readAt = new Date('2026-04-17T15:00:00Z')
      await repo.markAsRead('a', readAt)
      const after = await repo.findById('a')
      expect(after?.readAt).toEqual(readAt)
    })

    it('should return null when notification does not exist', async () => {
      const repo = createInMemoryNotificationRepository()
      const result = await repo.markAsRead('missing', new Date())
      expect(result).toBeNull()
    })

    it('should not mutate the original seeded notification (immutability)', async () => {
      const original = makeNotification({ id: 'a', readAt: null })
      const seed = [original]
      const repo = createInMemoryNotificationRepository(seed)
      await repo.markAsRead('a', new Date('2026-04-17T15:00:00Z'))
      expect(original.readAt).toBeNull()
    })
  })

  describe('create()', () => {
    it('should generate id and createdAt, default readAt to null', async () => {
      const repo = createInMemoryNotificationRepository()
      const created = await repo.create({
        userId: 'user-1',
        category: 'SYSTEM',
        title: 'タイトル',
        body: '本文',
        payload: null,
      })
      expect(created.id).toBeTruthy()
      expect(created.createdAt).toBeInstanceOf(Date)
      expect(created.readAt).toBeNull()
      expect(created.userId).toBe('user-1')
    })

    it('should make the created notification listable', async () => {
      const repo = createInMemoryNotificationRepository()
      const created = await repo.create({
        userId: 'user-1',
        category: 'SYSTEM',
        title: 'タイトル',
        body: '本文',
        payload: null,
      })
      const list = await repo.listByUser('user-1')
      expect(list.some((n) => n.id === created.id)).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// InMemoryPreferenceRepository
// ─────────────────────────────────────────────────────────────────────────────

describe('createInMemoryPreferenceRepository', () => {
  describe('listByUser()', () => {
    it('should return empty array when no preferences are stored', async () => {
      const repo = createInMemoryPreferenceRepository()
      const result = await repo.listByUser('user-1')
      expect(result).toEqual([])
    })

    it('should return seeded preferences for the user', async () => {
      const seed = new Map([
        [
          'user-1',
          [
            { category: 'SYSTEM' as const, emailEnabled: false },
            { category: 'EVAL_INVITATION' as const, emailEnabled: true },
          ],
        ],
      ])
      const repo = createInMemoryPreferenceRepository(seed)
      const result = await repo.listByUser('user-1')
      expect(result).toHaveLength(2)
    })

    it('should not leak preferences across users', async () => {
      const seed = new Map([['user-1', [{ category: 'SYSTEM' as const, emailEnabled: false }]]])
      const repo = createInMemoryPreferenceRepository(seed)
      const result = await repo.listByUser('user-2')
      expect(result).toEqual([])
    })
  })

  describe('upsertMany()', () => {
    it('should store preferences that can later be retrieved', async () => {
      const repo = createInMemoryPreferenceRepository()
      await repo.upsertMany('user-1', [{ category: 'SYSTEM', emailEnabled: false }])
      const result = await repo.listByUser('user-1')
      expect(result).toEqual([{ category: 'SYSTEM', emailEnabled: false }])
    })

    it('should replace existing preferences on subsequent upsert', async () => {
      const repo = createInMemoryPreferenceRepository()
      await repo.upsertMany('user-1', [
        { category: 'SYSTEM', emailEnabled: true },
        { category: 'EVAL_INVITATION', emailEnabled: true },
      ])
      await repo.upsertMany('user-1', [{ category: 'SYSTEM', emailEnabled: false }])
      const result = await repo.listByUser('user-1')
      expect(result).toEqual([{ category: 'SYSTEM', emailEnabled: false }])
    })
  })
})
