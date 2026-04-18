/**
 * Issue #29 / Req 14.9: 社員 CSV パーサ
 *
 * CSV パースとバリデーションの純粋関数群。DB 依存を持たず、
 * ImportRowError[] として行単位エラーを集約する（master-csv.ts と同形）。
 *
 * CSV ヘッダー: email,firstName,lastName,role,hireDate,departmentId,positionId
 */
import type { ImportRowError } from '@/lib/import/import-types'
import { USER_ROLES, type UserRole } from '@/lib/notification/notification-types'
import { parseIsoDate, type EmployeeCsvRow } from './lifecycle-types'

// ─────────────────────────────────────────────────────────────────────────────
// ヘッダ定義
// ─────────────────────────────────────────────────────────────────────────────

const EMPLOYEE_HEADER = [
  'email',
  'firstName',
  'lastName',
  'role',
  'hireDate',
  'departmentId',
  'positionId',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// CSV テキストパーサ（master-csv.ts と同一ロジック）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 極小 CSV パーサ。クォート付き値とエスケープ（""）に対応。
 * master-csv.ts と意図的に同一ロジックを用いる（後続で共通モジュール化してもよい）。
 */
function parseCsvText(csv: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < csv.length) {
    const ch = csv[i]

    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      cur.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      cur.push(field)
      rows.push(cur)
      cur = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }

  return rows
}

function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((c) => c.trim().length === 0)
}

function validateHeader(
  actual: readonly string[],
  expected: readonly string[],
): ImportRowError | null {
  const trimmed = actual.map((c) => c.trim())
  for (let i = 0; i < expected.length; i += 1) {
    if (trimmed[i] !== expected[i]) {
      return {
        rowNumber: 1,
        field: expected[i] ?? 'header',
        message: `ヘッダーが不正です。期待: ${expected.join(',')}`,
      }
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Row 検証
// ─────────────────────────────────────────────────────────────────────────────

interface RawRow {
  readonly rowNumber: number
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly role: string
  readonly hireDate: string
  readonly departmentId: string
  readonly positionId: string
}

function extractRawRow(rowNumber: number, cells: readonly string[]): RawRow {
  return {
    rowNumber,
    email: (cells[0] ?? '').trim(),
    firstName: (cells[1] ?? '').trim(),
    lastName: (cells[2] ?? '').trim(),
    role: (cells[3] ?? '').trim(),
    hireDate: (cells[4] ?? '').trim(),
    departmentId: (cells[5] ?? '').trim(),
    positionId: (cells[6] ?? '').trim(),
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value)
}

/** 必須文字列フィールドの欠如チェック */
function pushIfEmpty(
  errors: ImportRowError[],
  rowNumber: number,
  field: string,
  value: string,
): boolean {
  if (value.length === 0) {
    errors.push({ rowNumber, field, message: `${field} は必須です` })
    return true
  }
  return false
}

/** email フィールドの形式チェック */
function validateEmail(errors: ImportRowError[], rowNumber: number, email: string): void {
  if (pushIfEmpty(errors, rowNumber, 'email', email)) return
  if (!EMAIL_REGEX.test(email)) {
    errors.push({
      rowNumber,
      field: 'email',
      message: `email の形式が不正です（値: "${email}"）`,
    })
  }
}

/** role フィールドの enum チェック */
function validateRole(errors: ImportRowError[], rowNumber: number, role: string): void {
  if (pushIfEmpty(errors, rowNumber, 'role', role)) return
  if (!isUserRole(role)) {
    errors.push({
      rowNumber,
      field: 'role',
      message: `role は ${USER_ROLES.join(' | ')} のいずれかである必要があります（値: "${role}"）`,
    })
  }
}

/** hireDate フィールドの ISO 日付チェック */
function validateHireDate(
  errors: ImportRowError[],
  rowNumber: number,
  hireDate: string,
): Date | null {
  if (pushIfEmpty(errors, rowNumber, 'hireDate', hireDate)) return null
  const d = parseIsoDate(hireDate)
  if (d === null) {
    errors.push({
      rowNumber,
      field: 'hireDate',
      message: `hireDate は YYYY-MM-DD 形式である必要があります（値: "${hireDate}"）`,
    })
    return null
  }
  return d
}

/** 1 行を検証して Row か null を返す */
function validateRow(raw: RawRow, errors: ImportRowError[]): EmployeeCsvRow | null {
  const before = errors.length

  validateEmail(errors, raw.rowNumber, raw.email)
  pushIfEmpty(errors, raw.rowNumber, 'firstName', raw.firstName)
  pushIfEmpty(errors, raw.rowNumber, 'lastName', raw.lastName)
  validateRole(errors, raw.rowNumber, raw.role)
  const hireDate = validateHireDate(errors, raw.rowNumber, raw.hireDate)
  pushIfEmpty(errors, raw.rowNumber, 'departmentId', raw.departmentId)
  pushIfEmpty(errors, raw.rowNumber, 'positionId', raw.positionId)

  if (errors.length !== before) return null
  if (hireDate === null) return null
  if (!isUserRole(raw.role)) return null

  return {
    rowNumber: raw.rowNumber,
    email: raw.email,
    firstName: raw.firstName,
    lastName: raw.lastName,
    role: raw.role,
    hireDate,
    departmentId: raw.departmentId,
    positionId: raw.positionId,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 社員 CSV をパースして検証結果を返す。
 * - ヘッダーが不正な場合は rows=[] でエラー 1 件返す
 * - 各行のエラーは ImportRowError として集約する
 * - 同一 CSV 内で重複 email があれば 2 件目以降を重複エラーとして弾く
 */
export function parseEmployeeCsv(csv: string): {
  rows: EmployeeCsvRow[]
  errors: ImportRowError[]
} {
  const parsed = parseCsvText(csv)
  const errors: ImportRowError[] = []
  const rows: EmployeeCsvRow[] = []

  if (parsed.length === 0) {
    errors.push({ rowNumber: 1, field: 'header', message: 'CSV が空です' })
    return { rows, errors }
  }

  const headerError = validateHeader(parsed[0] ?? [], EMPLOYEE_HEADER)
  if (headerError) {
    errors.push(headerError)
    return { rows, errors }
  }

  const seenEmails = new Map<string, number>() // email(lowercase) -> rowNumber of first occurrence

  for (let r = 1; r < parsed.length; r += 1) {
    const cells = parsed[r] ?? []
    if (isBlankRow(cells)) continue

    const rowNumber = r + 1
    const raw = extractRawRow(rowNumber, cells)
    const row = validateRow(raw, errors)
    if (row === null) continue

    const emailKey = row.email.toLowerCase()
    const prev = seenEmails.get(emailKey)
    if (prev !== undefined) {
      errors.push({
        rowNumber,
        field: 'email',
        message: `email が CSV 内で重複しています（最初の出現: 行 ${prev}）`,
      })
      continue
    }

    seenEmails.set(emailKey, rowNumber)
    rows.push(row)
  }

  return { rows, errors }
}

/** テスト/他モジュールで参照する CSV ヘッダー（readonly 配列） */
export const EMPLOYEE_CSV_HEADER: readonly string[] = EMPLOYEE_HEADER
