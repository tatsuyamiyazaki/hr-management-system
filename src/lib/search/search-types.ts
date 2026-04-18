/**
 * Issue #34 / Req 16.3, 16.4, 16.6: 社員検索の型定義
 *
 * - EmployeeStatus: 社員の在籍ステータス
 * - EmployeeSearchQuery: 検索クエリ（フィルタ・デフォルト除外・ページ制限）
 * - EmployeeSearchResult: 検索結果の投影
 * - 検索専用レート制限定数
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** 社員の在籍ステータス (AuthUserStatus と同一ラベル) */
export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'PENDING_JOIN'] as const
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]

/** デフォルトで検索結果に含めるステータス (Req 16.5: 退職・休職をデフォルト除外) */
export const DEFAULT_SEARCH_STATUSES: readonly EmployeeStatus[] = ['ACTIVE'] as const

/** 検索結果のデフォルト上限 */
export const DEFAULT_SEARCH_LIMIT = 20

/** 検索結果の最大上限 */
export const MAX_SEARCH_LIMIT = 100

/** 検索専用レート制限: 60 req/min/user (Req 16.6) */
export const SEARCH_RATE_LIMIT_MAX = 60

/** レート制限ウィンドウ (秒) */
export const SEARCH_RATE_LIMIT_WINDOW_SEC = 60

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeSearchQuery
// ─────────────────────────────────────────────────────────────────────────────

/** 検索クエリの Zod スキーマ */
export const employeeSearchQuerySchema = z.object({
  keyword: z.string().min(1).max(200),
  departmentIds: z.array(z.string().min(1)).optional(),
  roleIds: z.array(z.string().min(1)).optional(),
  statuses: z
    .array(z.enum(EMPLOYEE_STATUSES))
    .optional()
    .default([...DEFAULT_SEARCH_STATUSES]),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional().default(DEFAULT_SEARCH_LIMIT),
})

export type EmployeeSearchQuery = z.infer<typeof employeeSearchQuerySchema>

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeSearchResult
// ─────────────────────────────────────────────────────────────────────────────

/** 検索結果の社員投影 (Req 16.1: 氏名・所属・役職) */
export interface EmployeeSearchResult {
  readonly id: string
  readonly firstName: string
  readonly lastName: string
  readonly departmentId: string
  readonly departmentName: string
  readonly roleId: string
  readonly roleName: string
  readonly status: EmployeeStatus
}
