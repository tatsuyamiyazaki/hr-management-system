/**
 * Issue #45 / Req 6.8: 目標期限アラート型定義
 */

// ─────────────────────────────────────────────────────────────────────────────
// アラート対象の目標情報
// ─────────────────────────────────────────────────────────────────────────────

export interface DeadlineAlertTarget {
  readonly goalId: string
  readonly userId: string
  readonly title: string
  readonly endDate: Date
  /** 0=当日, 1=1日前, 7=7日以内 */
  readonly daysUntilDeadline: number
  readonly currentProgressRate: number
}

// ─────────────────────────────────────────────────────────────────────────────
// アラートトリガー（重複防止用）
// ─────────────────────────────────────────────────────────────────────────────

/** 通知を送るタイミング。重複防止のため特定日のみ送信する */
export type AlertTrigger = '7days' | '3days' | '1day' | 'today'

/** 通知を送る残日数のセット */
export const ALERT_TRIGGER_DAYS: ReadonlySet<number> = new Set([0, 1, 3, 7])

/** 進捗が閾値未満の場合のみアラート送信 */
export const DEADLINE_ALERT_PROGRESS_THRESHOLD = 50

/** スキャン対象の最大残日数 */
export const DEADLINE_ALERT_SCAN_DAYS = 7
