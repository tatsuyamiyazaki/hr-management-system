import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

export const NOTIFICATION_CATEGORIES = [
  'EVAL_INVITATION',
  'EVAL_REMINDER',
  'GOAL_APPROVAL_REQUEST',
  'ONE_ON_ONE_REMINDER',
  'DEADLINE_ALERT',
  'FEEDBACK_PUBLISHED',
  'SYSTEM',
  'CUSTOM',
] as const

export const NOTIFICATION_CHANNELS = ['EMAIL', 'IN_APP'] as const

export const DELIVERY_STATUSES = ['SENT', 'FAILED', 'RETRYING'] as const

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const notificationEventSchema = z.object({
  userId: z.string().min(1),
  category: z.enum(NOTIFICATION_CATEGORIES),
  title: z.string().min(1),
  body: z.string(),
  payload: z.record(z.unknown()).optional(),
})

export type NotificationEvent = z.infer<typeof notificationEventSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Notification（アプリ内通知）
// ─────────────────────────────────────────────────────────────────────────────

/** 通知ID（DB/ストア が発行する文字列 id のエイリアス） */
export type NotificationId = string

export const notificationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  category: z.enum(NOTIFICATION_CATEGORIES),
  title: z.string().min(1),
  body: z.string(),
  payload: z.record(z.unknown()).nullable().optional(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
})

export type Notification = z.infer<typeof notificationSchema>

export function isNotification(value: unknown): value is Notification {
  return notificationSchema.safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// NotificationPreference（通知種別ごとのメール送信設定）
// ─────────────────────────────────────────────────────────────────────────────

export const notificationPreferenceSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES),
  emailEnabled: z.boolean(),
})

export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>

export const notificationPreferencesSchema = z.array(notificationPreferenceSchema)

/**
 * 通知設定（アプリ内通知は常時有効、メール通知のみカテゴリ別 ON/OFF）。
 * Req 15.3 参照。
 */
export type NotificationPreferences = readonly NotificationPreference[]

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === 'string' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
}

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return typeof value === 'string' && (NOTIFICATION_CHANNELS as readonly string[]).includes(value)
}

export function isNotificationEvent(value: unknown): value is NotificationEvent {
  return notificationEventSchema.safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// User roles（Requirement 1.7 準拠、4 ロール）
// ─────────────────────────────────────────────────────────────────────────────

export const USER_ROLES = ['ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] as const
export type UserRole = (typeof USER_ROLES)[number]

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast types（Req 15.8: HR_MANAGER 以上が全社員または特定グループへ送信）
// ─────────────────────────────────────────────────────────────────────────────

/** 送信対象指定（全社員 or 特定グループ） */
export const broadcastTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALL') }),
  z.object({ type: z.literal('GROUP'), groupId: z.string().min(1) }),
])

export type BroadcastTarget = z.infer<typeof broadcastTargetSchema>

/** カスタムブロードキャスト入力 */
export const broadcastInputSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  target: broadcastTargetSchema,
})

export type BroadcastInput = z.infer<typeof broadcastInputSchema>
