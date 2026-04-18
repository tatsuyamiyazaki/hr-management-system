/**
 * Issue #26: マスタ CSV インポート/エクスポート
 *
 * スキル/ロール/グレードのマスタ CSV をパース・バリデート・生成する純粋関数群。
 * DB 依存を一切持たず、テスト容易性を重視する。
 */
import type { ImportRowError } from '@/lib/import/import-types'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const GRADE_WEIGHT_SUM = 1
const GRADE_WEIGHT_TOLERANCE = 0.001
const MIN_REQUIRED_LEVEL = 1
const MAX_REQUIRED_LEVEL = 5

/** マスタリソース種別 */
export const MASTER_RESOURCES = ['skill', 'role', 'grade'] as const
export type MasterResource = (typeof MASTER_RESOURCES)[number]

export function isMasterResource(value: unknown): value is MasterResource {
  return typeof value === 'string' && (MASTER_RESOURCES as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Row 型
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillCsvRow {
  name: string
  category: string
  description?: string
}

export interface RoleCsvRow {
  name: string
  gradeId: string
  skillIds: string
  requiredLevels: string
}

export interface GradeCsvRow {
  label: string
  performanceWeight: string
  goalWeight: string
  feedbackWeight: string
}

// ─────────────────────────────────────────────────────────────────────────────
// DB 投影用のエクスポート入力型（後続タスクの MasterRepository と同形）
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillMasterRow {
  name: string
  category: string
  description?: string | null
}

export interface RoleMasterRow {
  name: string
  gradeId: string
  skillRequirements: Array<{ skillId: string; requiredLevel: number }>
}

export interface GradeMasterRow {
  label: string
  performanceWeight: number
  goalWeight: number
  feedbackWeight: number
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘッダ定義（生成時と検証時で共有）
// ─────────────────────────────────────────────────────────────────────────────

const SKILL_HEADER = ['name', 'category', 'description'] as const
const ROLE_HEADER = ['name', 'gradeId', 'skillIds', 'requiredLevels'] as const
const GRADE_HEADER = ['label', 'performanceWeight', 'goalWeight', 'feedbackWeight'] as const

// ─────────────────────────────────────────────────────────────────────────────
// CSV パースユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 極小 CSV パーサ。クォート付き値とエスケープ（""）に対応。
 * 大規模 CSV には papaparse 等を使うべきだが、ここでは依存ゼロで完結させる。
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

  // 末尾行（最終行の LF 無しケース）
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }

  return rows
}

function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((c) => c.trim().length === 0)
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsvLine(values: readonly string[]): string {
  return values.map(escapeCsv).join(',')
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
// parseSkillCsv
// ─────────────────────────────────────────────────────────────────────────────

export function parseSkillCsv(csv: string): {
  rows: SkillCsvRow[]
  errors: ImportRowError[]
} {
  const parsed = parseCsvText(csv)
  const errors: ImportRowError[] = []
  const rows: SkillCsvRow[] = []

  if (parsed.length === 0) {
    errors.push({ rowNumber: 1, field: 'header', message: 'CSV が空です' })
    return { rows, errors }
  }

  const headerError = validateHeader(parsed[0] ?? [], SKILL_HEADER)
  if (headerError) {
    errors.push(headerError)
    return { rows, errors }
  }

  for (let r = 1; r < parsed.length; r += 1) {
    const cells = parsed[r] ?? []
    if (isBlankRow(cells)) continue

    const rowNumber = r + 1
    const name = (cells[0] ?? '').trim()
    const category = (cells[1] ?? '').trim()
    const description = (cells[2] ?? '').trim()

    const rowErrors = validateSkillRow(rowNumber, name, category)
    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({
      name,
      category,
      ...(description.length > 0 ? { description } : {}),
    })
  }

  return { rows, errors }
}

function validateSkillRow(rowNumber: number, name: string, category: string): ImportRowError[] {
  const errors: ImportRowError[] = []
  if (name.length === 0) {
    errors.push({ rowNumber, field: 'name', message: 'name は必須です' })
  }
  if (category.length === 0) {
    errors.push({ rowNumber, field: 'category', message: 'category は必須です' })
  }
  return errors
}

// ─────────────────────────────────────────────────────────────────────────────
// parseRoleCsv
// ─────────────────────────────────────────────────────────────────────────────

export function parseRoleCsv(csv: string): {
  rows: RoleCsvRow[]
  errors: ImportRowError[]
} {
  const parsed = parseCsvText(csv)
  const errors: ImportRowError[] = []
  const rows: RoleCsvRow[] = []

  if (parsed.length === 0) {
    errors.push({ rowNumber: 1, field: 'header', message: 'CSV が空です' })
    return { rows, errors }
  }

  const headerError = validateHeader(parsed[0] ?? [], ROLE_HEADER)
  if (headerError) {
    errors.push(headerError)
    return { rows, errors }
  }

  for (let r = 1; r < parsed.length; r += 1) {
    const cells = parsed[r] ?? []
    if (isBlankRow(cells)) continue

    const rowNumber = r + 1
    const name = (cells[0] ?? '').trim()
    const gradeId = (cells[1] ?? '').trim()
    const skillIds = (cells[2] ?? '').trim()
    const requiredLevels = (cells[3] ?? '').trim()

    const rowErrors = validateRoleRow(rowNumber, name, gradeId, skillIds, requiredLevels)
    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({ name, gradeId, skillIds, requiredLevels })
  }

  return { rows, errors }
}

function validateRoleRow(
  rowNumber: number,
  name: string,
  gradeId: string,
  skillIds: string,
  requiredLevels: string,
): ImportRowError[] {
  const errors: ImportRowError[] = []
  if (name.length === 0) {
    errors.push({ rowNumber, field: 'name', message: 'name は必須です' })
  }
  if (gradeId.length === 0) {
    errors.push({ rowNumber, field: 'gradeId', message: 'gradeId は必須です' })
  }

  const ids = splitCsvList(skillIds)
  const levels = splitCsvList(requiredLevels)

  if (ids.length !== levels.length) {
    errors.push({
      rowNumber,
      field: 'requiredLevels',
      message: `skillIds と requiredLevels の件数が一致しません（${ids.length} vs ${levels.length}）`,
    })
    return errors
  }

  for (let j = 0; j < levels.length; j += 1) {
    const raw = levels[j] ?? ''
    const n = Number(raw)
    if (!Number.isInteger(n) || n < MIN_REQUIRED_LEVEL || n > MAX_REQUIRED_LEVEL) {
      errors.push({
        rowNumber,
        field: 'requiredLevels',
        message: `requiredLevel は ${MIN_REQUIRED_LEVEL}〜${MAX_REQUIRED_LEVEL} の整数である必要があります（値: "${raw}"）`,
      })
    }
  }

  return errors
}

function splitCsvList(s: string): string[] {
  if (s.length === 0) return []
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// parseGradeCsv
// ─────────────────────────────────────────────────────────────────────────────

export function parseGradeCsv(csv: string): {
  rows: GradeCsvRow[]
  errors: ImportRowError[]
} {
  const parsed = parseCsvText(csv)
  const errors: ImportRowError[] = []
  const rows: GradeCsvRow[] = []

  if (parsed.length === 0) {
    errors.push({ rowNumber: 1, field: 'header', message: 'CSV が空です' })
    return { rows, errors }
  }

  const headerError = validateHeader(parsed[0] ?? [], GRADE_HEADER)
  if (headerError) {
    errors.push(headerError)
    return { rows, errors }
  }

  for (let r = 1; r < parsed.length; r += 1) {
    const cells = parsed[r] ?? []
    if (isBlankRow(cells)) continue

    const rowNumber = r + 1
    const label = (cells[0] ?? '').trim()
    const performanceWeight = (cells[1] ?? '').trim()
    const goalWeight = (cells[2] ?? '').trim()
    const feedbackWeight = (cells[3] ?? '').trim()

    const rowErrors = validateGradeRow(
      rowNumber,
      label,
      performanceWeight,
      goalWeight,
      feedbackWeight,
    )
    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({ label, performanceWeight, goalWeight, feedbackWeight })
  }

  return { rows, errors }
}

function validateGradeRow(
  rowNumber: number,
  label: string,
  performanceWeight: string,
  goalWeight: string,
  feedbackWeight: string,
): ImportRowError[] {
  const errors: ImportRowError[] = []
  if (label.length === 0) {
    errors.push({ rowNumber, field: 'label', message: 'label は必須です' })
  }

  const w1 = parseWeight(rowNumber, 'performanceWeight', performanceWeight, errors)
  const w2 = parseWeight(rowNumber, 'goalWeight', goalWeight, errors)
  const w3 = parseWeight(rowNumber, 'feedbackWeight', feedbackWeight, errors)

  if (w1 !== null && w2 !== null && w3 !== null) {
    const sum = w1 + w2 + w3
    if (Math.abs(sum - GRADE_WEIGHT_SUM) > GRADE_WEIGHT_TOLERANCE) {
      errors.push({
        rowNumber,
        field: 'performanceWeight',
        message: `ウェイト合計が 1 ではありません（sum=${sum.toFixed(4)}、許容誤差 ±${GRADE_WEIGHT_TOLERANCE}）`,
      })
    }
  }

  return errors
}

function parseWeight(
  rowNumber: number,
  field: string,
  raw: string,
  errors: ImportRowError[],
): number | null {
  if (raw.length === 0) {
    errors.push({ rowNumber, field, message: `${field} は必須です` })
    return null
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    errors.push({
      rowNumber,
      field,
      message: `${field} は 0〜1 の数値である必要があります（値: "${raw}"）`,
    })
    return null
  }
  return n
}

// ─────────────────────────────────────────────────────────────────────────────
// エクスポート用 CSV 生成
// ─────────────────────────────────────────────────────────────────────────────

export function generateSkillCsv(skills: readonly SkillMasterRow[]): string {
  const header = toCsvLine(SKILL_HEADER)
  const body = skills.map((s) => toCsvLine([s.name, s.category, s.description ?? '']))
  return [header, ...body].join('\n') + '\n'
}

export function generateRoleCsv(roles: readonly RoleMasterRow[]): string {
  const header = toCsvLine(ROLE_HEADER)
  const body = roles.map((r) => {
    const skillIds = r.skillRequirements.map((x) => x.skillId).join(',')
    const levels = r.skillRequirements.map((x) => String(x.requiredLevel)).join(',')
    return toCsvLine([r.name, r.gradeId, skillIds, levels])
  })
  return [header, ...body].join('\n') + '\n'
}

export function generateGradeCsv(grades: readonly GradeMasterRow[]): string {
  const header = toCsvLine(GRADE_HEADER)
  const body = grades.map((g) =>
    toCsvLine([
      g.label,
      String(g.performanceWeight),
      String(g.goalWeight),
      String(g.feedbackWeight),
    ]),
  )
  return [header, ...body].join('\n') + '\n'
}
