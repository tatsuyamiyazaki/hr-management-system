import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { BroadcastRecipient, BroadcastTargetResolver } from './broadcast-target-resolver'
import type { NotificationEmitter } from './notification-emitter'
import type {
  NotificationPreferenceRepository,
  NotificationRepository,
} from './notification-repository'
import {
  broadcastInputSchema,
  type BroadcastInput,
  type BroadcastTarget,
  type NotificationPreferences,
  type UserRole,
} from './notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// ドメイン例外
// ─────────────────────────────────────────────────────────────────────────────

/** 実行ロールが HR_MANAGER / ADMIN のいずれでもない場合 */
export class BroadcastForbiddenError extends Error {
  constructor(role: UserRole) {
    super(`Broadcast forbidden for role: ${role}`)
    this.name = 'BroadcastForbiddenError'
  }
}

/** target=GROUP で groupId に該当するグループが存在しない場合 */
export class BroadcastGroupNotFoundError extends Error {
  constructor(groupId: string) {
    super(`Broadcast group not found: ${groupId}`)
    this.name = 'BroadcastGroupNotFoundError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** カスタムブロードキャスト送信者のコンテキスト */
export interface BroadcastSender {
  readonly userId: string
  readonly role: UserRole
}

/** 監査ログに記録する HTTP リクエスト情報 */
export interface BroadcastRequestContext {
  readonly ipAddress: string
  readonly userAgent: string
}

export interface BroadcastResult {
  readonly deliveredCount: number
}

/**
 * CustomBroadcastService — 手動カスタム通知（Req 15.8）
 *
 * - HR_MANAGER / ADMIN のみが呼び出し可能（最初にロール判定、それ以外の副作用を起こさない）
 * - 対象ユーザーごとに、アプリ内通知を作成 + preferences に従ってメール emit
 * - 成功後、1 回だけ CUSTOM_BROADCAST_SENT の監査ログを emit
 */
export interface CustomBroadcastService {
  sendCustomBroadcast(
    sender: BroadcastSender,
    input: BroadcastInput,
    context: BroadcastRequestContext,
  ): Promise<BroadcastResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** ブロードキャスト実行を許可するロール */
const ALLOWED_ROLES = new Set<UserRole>(['HR_MANAGER', 'ADMIN'])

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 指定ユーザーの CUSTOM カテゴリで email を送るべきか判定する。
 * 保存された preferences が見つからない場合は emailEnabled=true がデフォルト（Req 15.3）。
 */
function shouldSendEmail(prefs: NotificationPreferences): boolean {
  const custom = prefs.find((p) => p.category === 'CUSTOM')
  if (!custom) {
    return true
  }
  return custom.emailEnabled
}

interface Dependencies {
  readonly emitter: NotificationEmitter
  readonly notifications: NotificationRepository
  readonly preferences: NotificationPreferenceRepository
  readonly audit: AuditLogEmitter
  readonly resolver: BroadcastTargetResolver
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class CustomBroadcastServiceImpl implements CustomBroadcastService {
  constructor(private readonly deps: Dependencies) {}

  async sendCustomBroadcast(
    sender: BroadcastSender,
    input: BroadcastInput,
    context: BroadcastRequestContext,
  ): Promise<BroadcastResult> {
    // 1) ロール判定を最初に行い、それ以外の副作用を一切起こさない
    if (!ALLOWED_ROLES.has(sender.role)) {
      throw new BroadcastForbiddenError(sender.role)
    }

    // 2) Zod による入力検証
    const validated = broadcastInputSchema.parse(input)

    // 3) 対象ユーザーを解決（不明 groupId は BroadcastGroupNotFoundError）
    const recipients = await this.deps.resolver.resolve(validated.target)

    // 4) 各対象ユーザーに通知を配信
    const deliveredCount = await this.deliverToRecipients({
      recipients,
      title: validated.title,
      body: validated.body,
      target: validated.target,
      senderUserId: sender.userId,
    })

    // 5) 監査ログを 1 件だけ emit
    await this.deps.audit.emit({
      userId: sender.userId,
      action: 'CUSTOM_BROADCAST_SENT',
      resourceType: 'NOTIFICATION',
      resourceId: null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      before: null,
      after: {
        title: validated.title,
        body: validated.body,
        target: validated.target,
        deliveredCount,
      },
    })

    return { deliveredCount }
  }

  private async deliverToRecipients(args: {
    readonly recipients: readonly BroadcastRecipient[]
    readonly title: string
    readonly body: string
    readonly target: BroadcastTarget
    readonly senderUserId: string
  }): Promise<number> {
    const { recipients, title, body, target, senderUserId } = args
    const payload = { broadcastBy: senderUserId, target }

    let delivered = 0
    for (const recipient of recipients) {
      await this.deps.notifications.create({
        userId: recipient.userId,
        category: 'CUSTOM',
        title,
        body,
        payload,
      })

      const prefs = await this.deps.preferences.listByUser(recipient.userId)
      if (shouldSendEmail(prefs)) {
        await this.deps.emitter.emit({
          userId: recipient.userId,
          category: 'CUSTOM',
          title,
          body,
          payload,
        })
      }

      delivered += 1
    }
    return delivered
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createCustomBroadcastService(deps: Dependencies): CustomBroadcastService {
  return new CustomBroadcastServiceImpl(deps)
}
