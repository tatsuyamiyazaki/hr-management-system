import { describe, it, expect, beforeEach } from 'vitest'
import {
  createInMemoryNotificationRepository,
  createInMemoryPreferenceRepository,
} from '@/lib/notification/notification-repository'
import type {
  NotificationRepository,
  NotificationPreferenceRepository,
} from '@/lib/notification/notification-repository'
import { createNotificationService } from '@/lib/notification/notification-service'
import type { NotificationService } from '@/lib/notification/notification-service'
import { NOTIFICATION_CATEGORIES, type Notification } from '@/lib/notification/notification-types'

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
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  let notifications: NotificationRepository
  let preferences: NotificationPreferenceRepository
  let service: NotificationService

  beforeEach(() => {
    notifications = createInMemoryNotificationRepository([
      makeNotification({
        id: 'n1',
        userId: 'user-1',
        readAt: null,
        createdAt: new Date('2026-04-15T00:00:00Z'),
      }),
      makeNotification({
        id: 'n2',
        userId: 'user-1',
        readAt: new Date('2026-04-16T09:00:00Z'),
        createdAt: new Date('2026-04-16T00:00:00Z'),
      }),
      makeNotification({
        id: 'n3',
        userId: 'user-1',
        readAt: null,
        createdAt: new Date('2026-04-17T00:00:00Z'),
      }),
      makeNotification({ id: 'other-1', userId: 'user-2', readAt: null }),
    ])
    preferences = createInMemoryPreferenceRepository()
    service = createNotificationService({ notifications, preferences })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // listForUser
  // ───────────────────────────────────────────────────────────────────────────

  describe('listForUser()', () => {
    it('should return notifications belonging to the user sorted desc', async () => {
      const result = await service.listForUser('user-1')
      expect(result.notifications.map((n) => n.id)).toEqual(['n3', 'n2', 'n1'])
    })

    it('should return unreadCount equal to number of readAt=null notifications', async () => {
      const result = await service.listForUser('user-1')
      expect(result.unreadCount).toBe(2)
    })

    it('should not include other users notifications', async () => {
      const result = await service.listForUser('user-1')
      expect(result.notifications.every((n) => n.userId === 'user-1')).toBe(true)
    })

    it('should return zero unreadCount when all notifications are read', async () => {
      const repo = createInMemoryNotificationRepository([
        makeNotification({ id: 'a', readAt: new Date() }),
      ])
      const s = createNotificationService({
        notifications: repo,
        preferences,
      })
      const result = await s.listForUser('user-1')
      expect(result.unreadCount).toBe(0)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // markAsRead
  // ───────────────────────────────────────────────────────────────────────────

  describe('markAsRead()', () => {
    it('should set readAt on an unread notification', async () => {
      const updated = await service.markAsRead('user-1', 'n1')
      expect(updated.readAt).toBeInstanceOf(Date)
    })

    it('should decrement the unread count after marking as read', async () => {
      await service.markAsRead('user-1', 'n1')
      const after = await service.listForUser('user-1')
      expect(after.unreadCount).toBe(1)
    })

    it('should be idempotent on an already-read notification', async () => {
      const first = await service.markAsRead('user-1', 'n2')
      const second = await service.markAsRead('user-1', 'n2')
      expect(first.readAt).toEqual(second.readAt)
    })

    it('should throw when marking another user notification as read', async () => {
      await expect(service.markAsRead('user-1', 'other-1')).rejects.toThrow()
    })

    it('should throw when notification does not exist', async () => {
      await expect(service.markAsRead('user-1', 'missing')).rejects.toThrow()
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // updatePreferences
  // ───────────────────────────────────────────────────────────────────────────

  describe('updatePreferences()', () => {
    it('should save valid preferences', async () => {
      await service.updatePreferences('user-1', [
        { category: 'SYSTEM', emailEnabled: false },
        { category: 'EVAL_INVITATION', emailEnabled: true },
      ])
      const stored = await preferences.listByUser('user-1')
      expect(stored).toHaveLength(2)
    })

    it('should reject invalid category via Zod validation', async () => {
      await expect(
        service.updatePreferences('user-1', [
          // 意図的に不正なカテゴリを渡す
          { category: 'UNKNOWN', emailEnabled: true } as unknown as {
            category: 'SYSTEM'
            emailEnabled: boolean
          },
        ]),
      ).rejects.toThrow()
    })

    it('should reject non-boolean emailEnabled via Zod validation', async () => {
      await expect(
        service.updatePreferences('user-1', [
          { category: 'SYSTEM', emailEnabled: 'yes' } as unknown as {
            category: 'SYSTEM'
            emailEnabled: boolean
          },
        ]),
      ).rejects.toThrow()
    })

    it('should reject when userId is empty', async () => {
      await expect(
        service.updatePreferences('', [{ category: 'SYSTEM', emailEnabled: true }]),
      ).rejects.toThrow()
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // getPreferences
  // ───────────────────────────────────────────────────────────────────────────

  describe('getPreferences()', () => {
    it('should return default emailEnabled=true for all categories when none stored', async () => {
      const result = await service.getPreferences('user-1')
      expect(result).toHaveLength(NOTIFICATION_CATEGORIES.length)
      expect(result.every((p) => p.emailEnabled === true)).toBe(true)
    })

    it('should merge stored preferences with defaults', async () => {
      await service.updatePreferences('user-1', [{ category: 'SYSTEM', emailEnabled: false }])
      const result = await service.getPreferences('user-1')
      const systemPref = result.find((p) => p.category === 'SYSTEM')
      const evalPref = result.find((p) => p.category === 'EVAL_INVITATION')
      expect(systemPref?.emailEnabled).toBe(false)
      expect(evalPref?.emailEnabled).toBe(true)
    })

    it('should cover every NotificationCategory exactly once', async () => {
      const result = await service.getPreferences('user-1')
      const categories = result.map((p) => p.category).sort()
      const expected = [...NOTIFICATION_CATEGORIES].sort()
      expect(categories).toEqual(expected)
    })
  })
})
