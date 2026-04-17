/**
 * Task 6.2 / Req 1.3: アカウントロック通知
 *
 * ロック閾値に到達した瞬間、ユーザーへロック通知を送るための narrow port。
 * 既存 NotificationEmitter (src/lib/notification/notification-emitter.ts) と
 * 互換な shape を期待するが、直接依存させず型定義だけで結合する。
 */

/**
 * Notification カテゴリは 'SYSTEM' 固定。
 * 送信先側の詳細 (メール vs アプリ内) は NotificationEmitter 側の設定に従う。
 */
export interface LockoutNotifier {
  notifyLocked(params: {
    readonly userId: string
    readonly email: string
    readonly lockedUntil: Date
  }): Promise<void>
}

/**
 * 送信側 port。NotificationEmitter.emit と互換。
 * - category は 'SYSTEM' に固定
 * - payload は UI / テンプレート側で必要な情報を任意で渡す
 */
export interface LockoutNotifierEmitterPort {
  emit(event: {
    readonly userId: string
    readonly category: 'SYSTEM'
    readonly title: string
    readonly body: string
    readonly payload?: Record<string, unknown>
  }): Promise<void>
}

export interface LockoutNotifierDeps {
  readonly emitter: LockoutNotifierEmitterPort
}

const LOCKOUT_NOTIFICATION_TITLE = 'アカウントがロックされました'

function buildBody(lockedUntil: Date): string {
  return `連続ログイン失敗により、アカウントを 15 分間ロックしました。解除予定: ${lockedUntil.toISOString()}`
}

class NotificationEmitterLockoutNotifier implements LockoutNotifier {
  private readonly emitter: LockoutNotifierEmitterPort

  constructor(deps: LockoutNotifierDeps) {
    this.emitter = deps.emitter
  }

  async notifyLocked(params: {
    readonly userId: string
    readonly email: string
    readonly lockedUntil: Date
  }): Promise<void> {
    await this.emitter.emit({
      userId: params.userId,
      category: 'SYSTEM',
      title: LOCKOUT_NOTIFICATION_TITLE,
      body: buildBody(params.lockedUntil),
      payload: {
        email: params.email,
        lockedUntil: params.lockedUntil.toISOString(),
      },
    })
  }
}

export function createNotificationEmitterLockoutNotifier(
  deps: LockoutNotifierDeps,
): LockoutNotifier {
  return new NotificationEmitterLockoutNotifier(deps)
}
