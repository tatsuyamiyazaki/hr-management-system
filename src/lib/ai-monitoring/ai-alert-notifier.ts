/**
 * AIAlertNotifier — AI 予算閾値到達時の ADMIN アラート送信抽象
 *
 * - 同一 (yearMonth, level) ペアに対する通知は 1 度のみ (冪等)。
 * - NotificationEmitter ベースの実装を提供。各 ADMIN ユーザーに個別に emit する。
 * - 実運用では sentRecord を Redis / DB で差し替えて永続化すること。
 *
 * 関連要件: Req 19.3, 19.4
 */
import type { AlertLevel, YearMonth } from './ai-budget-types'

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AIAlertNotifyParams {
  readonly yearMonth: YearMonth
  readonly level: Exclude<AlertLevel, 'NONE'>
  readonly currentCostUsd: number
  readonly budgetUsd: number
  readonly utilizationPct: number
}

export interface AIAlertNotifier {
  /** 既に同じ yearMonth + level で通知済みの場合は冪等にスキップする */
  notify(params: AIAlertNotifyParams): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// NotificationEmitter port (notification-emitter.ts への narrow port)
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertNotificationEmitterPort {
  emit(event: {
    userId: string
    category: 'SYSTEM'
    title: string
    body: string
    payload?: Record<string, unknown>
  }): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

function buildAlertTitle(level: Exclude<AlertLevel, 'NONE'>, yearMonth: YearMonth): string {
  if (level === 'CRITICAL') {
    return `[AI 予算 CRITICAL] ${yearMonth} の利用額が予算上限に到達しました`
  }
  return `[AI 予算 WARN] ${yearMonth} の利用額が警告閾値に到達しました`
}

function buildAlertBody(params: AIAlertNotifyParams): string {
  const { yearMonth, level, currentCostUsd, budgetUsd, utilizationPct } = params
  const utilStr = utilizationPct.toFixed(1)
  const currentStr = currentCostUsd.toFixed(2)
  const budgetStr = budgetUsd.toFixed(2)
  if (level === 'CRITICAL') {
    return [
      `${yearMonth} の月次 AI 利用額が設定予算の 100% に到達しました。`,
      `現在のコスト: $${currentStr} / 予算: $${budgetStr} (利用率 ${utilStr}%)`,
      '非クリティカル機能 (要約生成等) を自動的に一時停止しました。',
    ].join('\n')
  }
  return [
    `${yearMonth} の月次 AI 利用額が警告閾値に到達しました。`,
    `現在のコスト: $${currentStr} / 予算: $${budgetStr} (利用率 ${utilStr}%)`,
    '予算超過が近い可能性があります。予算設定または利用状況の確認を推奨します。',
  ].join('\n')
}

class NotificationEmitterAIAlertNotifier implements AIAlertNotifier {
  private readonly emitter: AlertNotificationEmitterPort
  private readonly adminUserIdsProvider: () => Promise<readonly string[]>
  private readonly sentRecord: Set<string>

  constructor(deps: {
    emitter: AlertNotificationEmitterPort
    adminUserIdsProvider: () => Promise<readonly string[]>
    sentRecord?: Set<string>
  }) {
    this.emitter = deps.emitter
    this.adminUserIdsProvider = deps.adminUserIdsProvider
    this.sentRecord = deps.sentRecord ?? new Set<string>()
  }

  async notify(params: AIAlertNotifyParams): Promise<void> {
    const key = `${params.yearMonth}:${params.level}`
    // 冪等: 既に送信済みならスキップ
    if (this.sentRecord.has(key)) return

    const adminIds = await this.adminUserIdsProvider()
    if (adminIds.length === 0) {
      // ADMIN 不在の場合も記録は残し、同条件での再試行を抑止する
      this.sentRecord.add(key)
      return
    }

    const title = buildAlertTitle(params.level, params.yearMonth)
    const body = buildAlertBody(params)
    const payload: Record<string, unknown> = {
      yearMonth: params.yearMonth,
      level: params.level,
      currentCostUsd: params.currentCostUsd,
      budgetUsd: params.budgetUsd,
      utilizationPct: params.utilizationPct,
    }

    // 各 ADMIN に通知イベントを発行する。emitter 内部で非同期キュー投入されるため
    // 並列 emit で十分。個別の失敗は Promise.allSettled で集約する。
    const results = await Promise.allSettled(
      adminIds.map((userId) =>
        this.emitter.emit({
          userId,
          category: 'SYSTEM',
          title,
          body,
          payload,
        }),
      ),
    )

    // 全員失敗した場合は冪等記録を残さず (次回再送を許容)、
    // 1 件以上成功していれば「通知済み」として扱う。
    const hasSuccess = results.some((r) => r.status === 'fulfilled')
    if (hasSuccess) {
      this.sentRecord.add(key)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createNotificationEmitterAlertNotifier(deps: {
  emitter: AlertNotificationEmitterPort
  adminUserIdsProvider: () => Promise<readonly string[]>
  sentRecord?: Set<string>
}): AIAlertNotifier {
  return new NotificationEmitterAIAlertNotifier(deps)
}
