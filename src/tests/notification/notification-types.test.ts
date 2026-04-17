import { describe, it, expect } from 'vitest'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  DELIVERY_STATUSES,
  isNotificationCategory,
  isNotificationChannel,
  notificationEventSchema,
  isNotificationEvent,
  notificationSchema,
  isNotification,
  notificationPreferenceSchema,
  notificationPreferencesSchema,
  USER_ROLES,
  isUserRole,
  broadcastInputSchema,
  broadcastTargetSchema,
} from '@/lib/notification/notification-types'

describe('NOTIFICATION_CATEGORIES', () => {
  it('should contain all required categories', () => {
    expect(NOTIFICATION_CATEGORIES).toContain('EVAL_INVITATION')
    expect(NOTIFICATION_CATEGORIES).toContain('EVAL_REMINDER')
    expect(NOTIFICATION_CATEGORIES).toContain('GOAL_APPROVAL_REQUEST')
    expect(NOTIFICATION_CATEGORIES).toContain('ONE_ON_ONE_REMINDER')
    expect(NOTIFICATION_CATEGORIES).toContain('DEADLINE_ALERT')
    expect(NOTIFICATION_CATEGORIES).toContain('FEEDBACK_PUBLISHED')
    expect(NOTIFICATION_CATEGORIES).toContain('SYSTEM')
    expect(NOTIFICATION_CATEGORIES).toContain('CUSTOM')
  })
})

describe('NOTIFICATION_CHANNELS', () => {
  it('should contain EMAIL and IN_APP', () => {
    expect(NOTIFICATION_CHANNELS).toContain('EMAIL')
    expect(NOTIFICATION_CHANNELS).toContain('IN_APP')
  })
})

describe('DELIVERY_STATUSES', () => {
  it('should contain SENT, FAILED, RETRYING', () => {
    expect(DELIVERY_STATUSES).toContain('SENT')
    expect(DELIVERY_STATUSES).toContain('FAILED')
    expect(DELIVERY_STATUSES).toContain('RETRYING')
  })
})

describe('isNotificationCategory()', () => {
  it('should return true for valid category', () => {
    expect(isNotificationCategory('EVAL_INVITATION')).toBe(true)
    expect(isNotificationCategory('SYSTEM')).toBe(true)
    expect(isNotificationCategory('CUSTOM')).toBe(true)
  })

  it('should return false for invalid category', () => {
    expect(isNotificationCategory('UNKNOWN')).toBe(false)
    expect(isNotificationCategory(null)).toBe(false)
    expect(isNotificationCategory(42)).toBe(false)
  })
})

describe('isNotificationChannel()', () => {
  it('should return true for EMAIL and IN_APP', () => {
    expect(isNotificationChannel('EMAIL')).toBe(true)
    expect(isNotificationChannel('IN_APP')).toBe(true)
  })

  it('should return false for invalid channel', () => {
    expect(isNotificationChannel('SMS')).toBe(false)
  })
})

describe('notificationEventSchema', () => {
  it('should accept a minimal valid event', () => {
    const result = notificationEventSchema.safeParse({
      userId: 'user-1',
      category: 'SYSTEM',
      title: 'テスト通知',
      body: '本文です',
    })
    expect(result.success).toBe(true)
  })

  it('should accept event with optional payload', () => {
    const result = notificationEventSchema.safeParse({
      userId: 'user-1',
      category: 'EVAL_INVITATION',
      title: '評価依頼',
      body: '評価を開始してください',
      payload: { cycleId: 'cycle-1' },
    })
    expect(result.success).toBe(true)
  })

  it('should reject event with empty userId', () => {
    const result = notificationEventSchema.safeParse({
      userId: '',
      category: 'SYSTEM',
      title: 'Test',
      body: 'Body',
    })
    expect(result.success).toBe(false)
  })

  it('should reject event with empty title', () => {
    const result = notificationEventSchema.safeParse({
      userId: 'user-1',
      category: 'SYSTEM',
      title: '',
      body: 'Body',
    })
    expect(result.success).toBe(false)
  })

  it('should reject event with unknown category', () => {
    const result = notificationEventSchema.safeParse({
      userId: 'user-1',
      category: 'UNKNOWN_CAT',
      title: 'Test',
      body: 'Body',
    })
    expect(result.success).toBe(false)
  })
})

describe('isNotificationEvent()', () => {
  it('should return true for valid event', () => {
    expect(
      isNotificationEvent({
        userId: 'user-1',
        category: 'SYSTEM',
        title: 'Test',
        body: 'Body',
      }),
    ).toBe(true)
  })

  it('should return false for null', () => {
    expect(isNotificationEvent(null)).toBe(false)
  })

  it('should return false for invalid category', () => {
    expect(
      isNotificationEvent({
        userId: 'user-1',
        category: 'BAD',
        title: 'Test',
        body: 'Body',
      }),
    ).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Notification（アプリ内通知）
// ─────────────────────────────────────────────────────────────────────────────

describe('notificationSchema', () => {
  it('should accept a notification with readAt=null', () => {
    const result = notificationSchema.safeParse({
      id: 'notif-1',
      userId: 'user-1',
      category: 'SYSTEM',
      title: 'テスト通知',
      body: '本文',
      payload: null,
      readAt: null,
      createdAt: new Date('2026-04-17T12:00:00Z'),
    })
    expect(result.success).toBe(true)
  })

  it('should accept a notification with readAt set', () => {
    const result = notificationSchema.safeParse({
      id: 'notif-2',
      userId: 'user-1',
      category: 'EVAL_INVITATION',
      title: '評価依頼',
      body: '評価を開始してください',
      payload: { cycleId: 'cycle-1' },
      readAt: new Date('2026-04-17T13:00:00Z'),
      createdAt: new Date('2026-04-17T12:00:00Z'),
    })
    expect(result.success).toBe(true)
  })

  it('should reject when id is empty', () => {
    const result = notificationSchema.safeParse({
      id: '',
      userId: 'user-1',
      category: 'SYSTEM',
      title: 'Test',
      body: 'Body',
      readAt: null,
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('should reject when createdAt is not a Date', () => {
    const result = notificationSchema.safeParse({
      id: 'notif-3',
      userId: 'user-1',
      category: 'SYSTEM',
      title: 'Test',
      body: 'Body',
      readAt: null,
      createdAt: '2026-04-17',
    })
    expect(result.success).toBe(false)
  })
})

describe('isNotification()', () => {
  it('should return true for valid notification', () => {
    expect(
      isNotification({
        id: 'notif-4',
        userId: 'user-1',
        category: 'SYSTEM',
        title: 'Test',
        body: 'Body',
        readAt: null,
        createdAt: new Date(),
      }),
    ).toBe(true)
  })

  it('should return false for null', () => {
    expect(isNotification(null)).toBe(false)
  })
})

describe('notificationPreferenceSchema', () => {
  it('should accept valid preference', () => {
    const result = notificationPreferenceSchema.safeParse({
      category: 'SYSTEM',
      emailEnabled: false,
    })
    expect(result.success).toBe(true)
  })

  it('should reject unknown category', () => {
    const result = notificationPreferenceSchema.safeParse({
      category: 'UNKNOWN',
      emailEnabled: true,
    })
    expect(result.success).toBe(false)
  })

  it('should reject non-boolean emailEnabled', () => {
    const result = notificationPreferenceSchema.safeParse({
      category: 'SYSTEM',
      emailEnabled: 'yes',
    })
    expect(result.success).toBe(false)
  })
})

describe('notificationPreferencesSchema', () => {
  it('should accept an array of preferences', () => {
    const result = notificationPreferencesSchema.safeParse([
      { category: 'SYSTEM', emailEnabled: true },
      { category: 'EVAL_INVITATION', emailEnabled: false },
    ])
    expect(result.success).toBe(true)
  })

  it('should accept an empty array', () => {
    const result = notificationPreferencesSchema.safeParse([])
    expect(result.success).toBe(true)
  })

  it('should reject a non-array value', () => {
    const result = notificationPreferencesSchema.safeParse({ category: 'SYSTEM' })
    expect(result.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// User roles（Req 1.7 / Req 15.8）
// ─────────────────────────────────────────────────────────────────────────────

describe('USER_ROLES', () => {
  it('should contain the four required roles', () => {
    expect(USER_ROLES).toContain('ADMIN')
    expect(USER_ROLES).toContain('HR_MANAGER')
    expect(USER_ROLES).toContain('MANAGER')
    expect(USER_ROLES).toContain('EMPLOYEE')
    expect(USER_ROLES).toHaveLength(4)
  })
})

describe('isUserRole()', () => {
  it('should return true for valid roles', () => {
    expect(isUserRole('ADMIN')).toBe(true)
    expect(isUserRole('HR_MANAGER')).toBe(true)
    expect(isUserRole('MANAGER')).toBe(true)
    expect(isUserRole('EMPLOYEE')).toBe(true)
  })

  it('should return false for invalid roles', () => {
    expect(isUserRole('admin')).toBe(false)
    expect(isUserRole('SUPER_ADMIN')).toBe(false)
    expect(isUserRole('')).toBe(false)
    expect(isUserRole(null)).toBe(false)
    expect(isUserRole(42)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast schemas（Req 15.8）
// ─────────────────────────────────────────────────────────────────────────────

describe('broadcastTargetSchema', () => {
  it('accepts target ALL', () => {
    expect(broadcastTargetSchema.safeParse({ type: 'ALL' }).success).toBe(true)
  })

  it('accepts target GROUP with non-empty groupId', () => {
    expect(broadcastTargetSchema.safeParse({ type: 'GROUP', groupId: 'group-1' }).success).toBe(
      true,
    )
  })

  it('rejects target GROUP with empty groupId', () => {
    expect(broadcastTargetSchema.safeParse({ type: 'GROUP', groupId: '' }).success).toBe(false)
  })

  it('rejects unknown type', () => {
    expect(broadcastTargetSchema.safeParse({ type: 'EVERYONE' }).success).toBe(false)
  })
})

describe('broadcastInputSchema', () => {
  it('accepts a valid broadcast input with target=ALL', () => {
    const result = broadcastInputSchema.safeParse({
      title: 'お知らせ',
      body: '本文',
      target: { type: 'ALL' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid broadcast input with target=GROUP', () => {
    const result = broadcastInputSchema.safeParse({
      title: 'お知らせ',
      body: '本文',
      target: { type: 'GROUP', groupId: 'group-1' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty title', () => {
    const result = broadcastInputSchema.safeParse({
      title: '',
      body: '本文',
      target: { type: 'ALL' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty body', () => {
    const result = broadcastInputSchema.safeParse({
      title: 'お知らせ',
      body: '',
      target: { type: 'ALL' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects title longer than 200 characters', () => {
    const result = broadcastInputSchema.safeParse({
      title: 'a'.repeat(201),
      body: '本文',
      target: { type: 'ALL' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing target', () => {
    const result = broadcastInputSchema.safeParse({
      title: 'お知らせ',
      body: '本文',
    })
    expect(result.success).toBe(false)
  })
})
