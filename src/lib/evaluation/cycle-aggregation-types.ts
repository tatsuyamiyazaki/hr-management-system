/**
 * Issue #56 / Task 15.7: サイクル途中の入退社扱いと集計 型定義
 * (Req 8.13, 8.14, 8.15, 8.18, 8.19)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

/** 被評価者ごとの集計結果 (Req 8.13, 8.14) */
export interface AggregatedUserResult {
  targetUserId: string
  /** 他者評価スコア合計 / 他者評価者数 (Req 8.13) */
  peerScore: number | null
  /** 有効なピア評価者数 */
  peerEvaluatorCount: number
  /** 自己評価スコア */
  selfScore: number | null
  /** 上司評価スコア */
  topDownScore: number | null
  /**
   * 評価者数が最低評価者数を下回る場合 true → 公開保留 (Req 8.14)
   * peerEvaluatorCount < cycle.minReviewers のとき true
   */
  minimumNotMet: boolean
  /** 匿名コメント群（送信済みのみ） */
  anonymousComments: string[]
}

/** サイクル全体の集計結果 (Req 8.15) */
export interface CycleAggregationResult {
  cycleId: string
  /** 集計対象の被評価者数 */
  totalTargets: number
  /** MinimumNotMet フラグが立った被評価者数 */
  minimumNotMetCount: number
  /** 被評価者ごとの集計結果 */
  results: AggregatedUserResult[]
}

/** 退職者割り当て無効化結果 (Req 8.19) */
export interface InvalidateResignedResult {
  /** 無効化した割り当て数 */
  invalidated: number
}

/** 在籍期間チェック結果 (Req 8.18) */
export interface EligibilityCheckResult {
  userId: string
  /** 在籍期間が評価対象期間の50%以上 → 被評価者として有効 */
  eligible: boolean
  /** 在籍割合（0〜1）。hireDate が null の場合は null */
  tenureRatio: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class CycleAggregationNotFoundError extends Error {
  constructor(cycleId: string) {
    super(`ReviewCycle not found: ${cycleId}`)
    this.name = 'CycleAggregationNotFoundError'
  }
}

export class CycleAggregationInvalidStatusError extends Error {
  constructor(status: string) {
    super(`Cannot aggregate cycle in status: ${status}`)
    this.name = 'CycleAggregationInvalidStatusError'
  }
}
