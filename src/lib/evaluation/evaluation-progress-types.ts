/**
 * Issue #55 / Task 15.6: 進捗表示とリマインダー 型定義
 * (Req 8.8, 8.9)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

/** 評価者個人の進捗 */
export interface EvaluatorProgressRecord {
  evaluatorId: string
  /** ACTIVE な割り当て総数 */
  totalAssignments: number
  /** 送信済み（isDraft: false）の評価数 */
  submittedCount: number
  /** 未送信（割り当てはあるが送信済みでない）の評価対象者数 */
  pendingCount: number
}

/** サイクル全体の進捗（HR向け） */
export interface CycleProgressRecord {
  cycleId: string
  /** 評価者総数 */
  totalEvaluators: number
  /** 全割り当て提出済みの評価者数 */
  fullySubmittedCount: number
  /** 評価者ごとの進捗一覧 */
  evaluators: EvaluatorProgressRecord[]
}

/** リマインダースキャン結果 */
export interface ReminderScanResult {
  /** 通知送信数 */
  notified: number
  /** スキップ数（既に提出済み等） */
  skipped: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class EvaluationProgressCycleNotFoundError extends Error {
  constructor(cycleId: string) {
    super(`ReviewCycle not found: ${cycleId}`)
    this.name = 'EvaluationProgressCycleNotFoundError'
  }
}
