import { z } from 'zod'
import type {
  NotificationRepository,
  NotificationPreferenceRepository,
} from './notification-repository'
import {
  NOTIFICATION_CATEGORIES,
  notificationPreferencesSchema,
  type Notification,
  type NotificationCategory,
  type NotificationId,
  type NotificationPreference,
  type NotificationPreferences,
} from './notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** listForUser の戻り値（通知一覧 + 未読件数）。Req 15.6 の未読バッジ更新に利用。 */
export interface NotificationListResult {
  readonly notifications: readonly Notification[]
  readonly unreadCount: number
}

/**
 * NotificationService インターフェース。
 * - listForUser: ユーザー別通知一覧 + 未読件数（Req 15.6）
 * - markAsRead: 通知を既読化（Req 15.6）
 * - updatePreferences / getPreferences: 種別別メール通知 ON/OFF（Req 15.3）
 *
 * Req 15.8 の sendCustomBroadcast は Task 4.4 で実装するため本 Service には含めない。
 */
export interface NotificationService {
  listForUser(userId: string): Promise<NotificationListResult>
  markAsRead(userId: string, notificationId: NotificationId): Promise<Notification>
  updatePreferences(userId: string, preferences: NotificationPreferences): Promise<void>
  getPreferences(userId: string): Promise<NotificationPreferences>
}

// ─────────────────────────────────────────────────────────────────────────────
// 入力バリデーションスキーマ
// ─────────────────────────────────────────────────────────────────────────────

const userIdSchema = z.string().min(1, 'userId must not be empty')
const notificationIdSchema = z.string().min(1, 'notificationId must not be empty')

// ─────────────────────────────────────────────────────────────────────────────
// ドメイン例外
// ─────────────────────────────────────────────────────────────────────────────

/** 指定 ID の通知が見つからない */
export class NotificationNotFoundError extends Error {
  constructor(notificationId: string) {
    super(`Notification not found: ${notificationId}`)
    this.name = 'NotificationNotFoundError'
  }
}

/** 他ユーザーの通知を操作しようとした */
export class NotificationAccessDeniedError extends Error {
  constructor(notificationId: string) {
    super(`Access denied for notification: ${notificationId}`)
    this.name = 'NotificationAccessDeniedError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function countUnread(list: readonly Notification[]): number {
  let count = 0
  for (const n of list) {
    if (n.readAt === null) count += 1
  }
  return count
}

function buildDefaultPreferences(stored: NotificationPreferences): NotificationPreferences {
  const storedByCategory = new Map<NotificationCategory, NotificationPreference>()
  for (const p of stored) {
    storedByCategory.set(p.category, p)
  }

  return NOTIFICATION_CATEGORIES.map((category) => {
    const existing = storedByCategory.get(category)
    // アプリ内通知は常時有効（Req 15.3）。保存されていないカテゴリは emailEnabled=true をデフォルトに。
    return existing ?? { category, emailEnabled: true }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

interface Dependencies {
  readonly notifications: NotificationRepository
  readonly preferences: NotificationPreferenceRepository
}

class NotificationServiceImpl implements NotificationService {
  constructor(private readonly deps: Dependencies) {}

  async listForUser(userId: string): Promise<NotificationListResult> {
    const validUserId = userIdSchema.parse(userId)
    const list = await this.deps.notifications.listByUser(validUserId)
    return {
      notifications: list,
      unreadCount: countUnread(list),
    }
  }

  async markAsRead(userId: string, notificationId: NotificationId): Promise<Notification> {
    const validUserId = userIdSchema.parse(userId)
    const validId = notificationIdSchema.parse(notificationId)

    const existing = await this.deps.notifications.findById(validId)
    if (!existing) {
      throw new NotificationNotFoundError(validId)
    }
    if (existing.userId !== validUserId) {
      // 他ユーザーの通知を既読化しようとした
      throw new NotificationAccessDeniedError(validId)
    }
    if (existing.readAt) {
      // 冪等: 既読済みは現状を返す
      return existing
    }

    const updated = await this.deps.notifications.markAsRead(validId, new Date())
    if (!updated) {
      // 競合等で更新対象が消えた場合
      throw new NotificationNotFoundError(validId)
    }
    return updated
  }

  async updatePreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
    const validUserId = userIdSchema.parse(userId)
    const validPrefs = notificationPreferencesSchema.parse(preferences)
    await this.deps.preferences.upsertMany(validUserId, validPrefs)
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const validUserId = userIdSchema.parse(userId)
    const stored = await this.deps.preferences.listByUser(validUserId)
    return buildDefaultPreferences(stored)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createNotificationService(deps: Dependencies): NotificationService {
  return new NotificationServiceImpl(deps)
}
