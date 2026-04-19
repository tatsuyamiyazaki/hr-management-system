/**
 * Issue #49 / Req 7.6, 7.7, 7.8: 1on1ログ未入力リマインダー型定義
 */

// ─────────────────────────────────────────────────────────────────────────────
// ログ未入力検出
// ─────────────────────────────────────────────────────────────────────────────

/** 30日以上ログがない部下の情報 */
export interface MissingLogEmployee {
  readonly managerId: string
  readonly employeeId: string
  /** 最後にログが記録された日時。null = 一度もログなし */
  readonly lastLogDate: Date | null
  readonly daysSinceLastLog: number
}

// ─────────────────────────────────────────────────────────────────────────────
// 評価フォーム連携
// ─────────────────────────────────────────────────────────────────────────────

/** 評価フォーム用 1on1 セッションへの参照リンク */
export interface EvaluationLogLink {
  readonly sessionId: string
  readonly scheduledAt: Date
  readonly logId: string | null
  readonly hasLog: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// HR_MANAGER 向け全ログ一覧
// ─────────────────────────────────────────────────────────────────────────────

/** HR_MANAGER 向け全ログエントリ */
export interface AllLogEntry {
  readonly logId: string
  readonly sessionId: string
  readonly managerId: string
  readonly employeeId: string
  readonly scheduledAt: Date
  readonly content: string
  readonly visibility: 'MANAGER_ONLY' | 'BOTH'
  readonly recordedAt: Date
}

/** 全ログ一覧クエリパラメータ */
export interface AllLogsQuery {
  readonly page: number
  readonly limit: number
  readonly from?: Date
  readonly to?: Date
}

/** 全ログ一覧レスポンス */
export interface AllLogsResult {
  readonly data: readonly AllLogEntry[]
  readonly total: number
}
