import { describe, it, expect } from 'vitest'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  DELIVERY_STATUSES,
  isNotificationCategory,
  isNotificationChannel,
  notificationEventSchema,
  isNotificationEvent,
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
