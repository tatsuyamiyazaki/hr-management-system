/**
 * Issue #33 / Req 16.1, 16.2, 16.5: 社員検索ドメイン型定義
 *
 * - EmployeeSearchQuery: 検索入力（keyword + フィルター）
 * - EmployeeSearchResult: 検索結果の1件分の投影
 * - EmployeeStatus: ステータスフィルタ用（Prisma enum を再利用）
 */

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeStatus (検索フィルタ用; Prisma schema の EmployeeStatus enum と一致)
// ─────────────────────────────────────────────────────────────────────────────

export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'PENDING_JOIN'] as const
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeSearchQuery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 社員検索クエリ。
 *
 * - keyword: 部分一致（pg_trgm）/ FTS 検索キーワード
 * - departmentIds: 部署 ID で絞り込み
 * - roleIds: 役職の roleId で絞り込み
 * - statuses: ステータスフィルタ（デフォルトは ACTIVE のみ）
 * - limit: 取得上限（デフォルト 20）
 */
export interface EmployeeSearchQuery {
  readonly keyword: string
  readonly departmentIds?: readonly string[]
  readonly roleIds?: readonly string[]
  readonly statuses?: readonly EmployeeStatus[]
  readonly limit?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeSearchResult
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 検索結果 1 件の投影。
 * 暗号化フィールド（email / phoneNumber）は含まない。
 */
export interface EmployeeSearchResult {
  readonly userId: string
  readonly firstName: string
  readonly lastName: string
  readonly firstNameKana: string | null
  readonly lastNameKana: string | null
  readonly departmentName: string | null
  readonly roleId: string | null
  readonly status: EmployeeStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** デフォルトの検索結果上限 */
export const DEFAULT_SEARCH_LIMIT = 20

/** 検索結果の最大上限 */
export const MAX_SEARCH_LIMIT = 100
