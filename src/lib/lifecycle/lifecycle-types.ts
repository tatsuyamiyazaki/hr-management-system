/**
 * Issue #29 / Req 14.1, 14.9: 社員ライフサイクル型定義
 *
 * - CreateEmployeeInput: 社員作成入力 (ADMIN / HR_MANAGER)
 * - EmployeeCsvRow: CSV 1 行を表す Row 型（バリデーション済み）
 * - BulkImportResult: CSV 一括インポートの結果
 * - Employee: 作成した社員の基本投影
 * - ドメイン例外: EmployeeAlreadyExistsError
 */
import { z } from 'zod'
import { USER_ROLES, type UserRole } from '@/lib/notification/notification-types'
import type { ImportRowError } from '@/lib/import/import-types'

// ─────────────────────────────────────────────────────────────────────────────
// CreateEmployeeInput
// ─────────────────────────────────────────────────────────────────────────────

/** ISO 日付 YYYY-MM-DD の厳密な正規表現（0000-9999） */
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * YYYY-MM-DD 文字列を Date に変換する。
 * 不正な日付（例: 2026-02-30）は Invalid Date として弾く。
 */
export function parseIsoDate(input: string): Date | null {
  if (!ISO_DATE_REGEX.test(input)) return null
  const d = new Date(`${input}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  // 月末補正などで入力と UTC 表現がズレる場合を検出
  const iso = d.toISOString().slice(0, 10)
  return iso === input ? d : null
}

/**
 * 社員作成入力のスキーマ。
 * - API 層 (JSON) では hireDate は ISO 日付文字列 (YYYY-MM-DD) で受け取り、Date に変換する
 * - CSV 層でも同様の文字列 → Date 変換を行う
 */
export const createEmployeeInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(USER_ROLES),
  hireDate: z
    .union([
      z.string().refine((s) => parseIsoDate(s) !== null, {
        message: 'hireDate must be ISO date (YYYY-MM-DD)',
      }),
      z.date(),
    ])
    .transform((v) => (v instanceof Date ? v : (parseIsoDate(v) as Date))),
  departmentId: z.string().min(1),
  positionId: z.string().min(1),
})

/** 社員作成入力（業務層が扱う Date 化済みの形） */
export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeCsvRow
// ─────────────────────────────────────────────────────────────────────────────

/** CSV 由来の社員 1 行。文字列→Date 変換済みで業務層に渡す。 */
export interface EmployeeCsvRow {
  readonly rowNumber: number
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly role: UserRole
  readonly hireDate: Date
  readonly departmentId: string
  readonly positionId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee / BulkImportResult
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 作成された社員の基本投影。
 * API レスポンスでは hireDate を ISO 文字列化して返す。
 */
export interface Employee {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly role: UserRole
  readonly hireDate: Date
  readonly departmentId: string
  readonly positionId: string
}

/** CSV 一括インポート結果 */
export interface BulkImportResult {
  readonly totalRows: number
  readonly successCount: number
  readonly failureCount: number
  readonly errors: readonly ImportRowError[]
  readonly jobId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/** 指定メールアドレスのユーザーが既に存在する（createEmployee 用） */
export class EmployeeAlreadyExistsError extends Error {
  public readonly email: string

  constructor(email: string) {
    super(`Employee already exists: ${email}`)
    this.name = 'EmployeeAlreadyExistsError'
    this.email = email
  }
}
