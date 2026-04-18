/**
 * Issue #33 / Req 16.1, 16.2, 16.5: 社員検索リポジトリ Prisma 実装
 *
 * - PrismaSearchRepository: PostgreSQL pg_trgm + tsvector + GIN による実装
 * - SearchRepository インターフェースは search-service.ts で定義済み
 *
 * 検索対象:
 *   - 氏名（firstName / lastName / firstNameKana / lastNameKana）: pg_trgm 部分一致
 *   - 社員番号: employeeCodeHash でブラインドインデックス完全一致
 *   - メール: emailHash でブラインドインデックス完全一致
 *   - 部署名: pg_trgm 部分一致
 *   - 役職 roleId: 完全一致
 */
import type { PrismaClient } from '@prisma/client'
import { computeEmailHash, computeEmployeeCodeHash } from '@/lib/shared/crypto'
import type { SearchRepository } from './search-service'
import type { EmployeeSearchQuery, EmployeeSearchResult, EmployeeStatus } from './search-types'

// ─────────────────────────────────────────────────────────────────────────────
// Prisma implementation
// ─────────────────────────────────────────────────────────────────────────────

interface RawSearchRow {
  user_id: string
  first_name: string
  last_name: string
  department_id: string | null
  department_name: string | null
  role_id: string | null
  role_name: string | null
  status: string
}

export class PrismaSearchRepository implements SearchRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly appSecret: string,
  ) {}

  async searchEmployees(query: EmployeeSearchQuery): Promise<EmployeeSearchResult[]> {
    const keyword = query.keyword.trim()

    // ブラインドインデックスを内部で計算
    const blindIndexes = await this.computeBlindIndexes(keyword)

    // パラメータリスト（$1〜$N で順番管理）
    const params: unknown[] = []
    const conditions: string[] = []

    // ── ステータスフィルタ（必須）──────────────────────────────────────────
    params.push(query.statuses as string[])
    conditions.push(`u.status = ANY($${params.length}::text[])`)

    // ── 部署フィルタ ────────────────────────────────────────────────────────
    if (query.departmentIds?.length) {
      params.push(query.departmentIds as string[])
      conditions.push(`p_pos.department_id = ANY($${params.length}::text[])`)
    }

    // ── 役職フィルタ ────────────────────────────────────────────────────────
    if (query.roleIds?.length) {
      params.push(query.roleIds as string[])
      conditions.push(`p_pos.role_id = ANY($${params.length}::text[])`)
    }

    // ── キーワード検索 ──────────────────────────────────────────────────────
    if (keyword.length > 0) {
      const keywordConditions: string[] = []

      // pg_trgm 部分一致（氏名 + 部署名）
      params.push(`%${escapeLike(keyword)}%`)
      const likeParam = `$${params.length}`
      keywordConditions.push(
        `prof.first_name ILIKE ${likeParam}`,
        `prof.last_name ILIKE ${likeParam}`,
        `prof.first_name_kana ILIKE ${likeParam}`,
        `prof.last_name_kana ILIKE ${likeParam}`,
        `dept.name ILIKE ${likeParam}`,
      )

      // ブラインドインデックス完全一致（メール）
      if (blindIndexes.emailHash) {
        params.push(blindIndexes.emailHash)
        keywordConditions.push(`u.email_hash = $${params.length}`)
      }

      // ブラインドインデックス完全一致（社員番号）
      if (blindIndexes.employeeCodeHash) {
        params.push(blindIndexes.employeeCodeHash)
        keywordConditions.push(`prof.employee_code_hash = $${params.length}`)
      }

      conditions.push(`(${keywordConditions.join(' OR ')})`)
    }

    // ── LIMIT ──────────────────────────────────────────────────────────────
    params.push(query.limit)
    const limitParam = `$${params.length}`

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const sql = `
      SELECT
        prof.user_id        AS user_id,
        prof.first_name     AS first_name,
        prof.last_name      AS last_name,
        p_pos.department_id AS department_id,
        dept.name           AS department_name,
        p_pos.role_id       AS role_id,
        rm.name             AS role_name,
        u.status            AS status
      FROM profiles prof
      INNER JOIN users u ON u.id = prof.user_id
      LEFT JOIN positions p_pos ON u.position_id = p_pos.id
      LEFT JOIN departments dept ON p_pos.department_id = dept.id
      LEFT JOIN role_masters rm ON p_pos.role_id = rm.id
      ${whereClause}
      ORDER BY prof.last_name ASC, prof.first_name ASC
      LIMIT ${limitParam}
    `

    // Note: $queryRawUnsafe is used because the WHERE clause is dynamically composed.
    // All user-supplied values are passed as parameterized placeholders ($1, $2, …),
    // so no raw user input is interpolated into the SQL string.
    const rows: RawSearchRow[] = await (this.db as unknown as RawQueryExecutor).$queryRawUnsafe(
      sql,
      ...params,
    )

    return rows.map(mapRow)
  }

  /**
   * keyword からブラインドインデックスを算出する。
   *
   * - メールアドレスらしい形式 → emailHash を計算
   * - それ以外 → employeeCodeHash のみ計算（社員番号完全一致用）
   */
  private async computeBlindIndexes(
    keyword: string,
  ): Promise<{ emailHash: string | null; employeeCodeHash: string | null }> {
    if (keyword.length === 0) {
      return { emailHash: null, employeeCodeHash: null }
    }

    // メールアドレス判定（簡易: user@domain.tld 形式）
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(keyword)
    const emailHash = looksLikeEmail
      ? await computeEmailHash(keyword, this.appSecret)
      : null
    const employeeCodeHash = await computeEmployeeCodeHash(keyword, this.appSecret)

    return { emailHash, employeeCodeHash }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Prisma の $queryRawUnsafe 型 */
interface RawQueryExecutor {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T[]>
}

/** LIKE パターン内のメタ文字をエスケープ */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&')
}

function mapRow(row: RawSearchRow): EmployeeSearchResult {
  return {
    id: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    departmentId: row.department_id ?? '',
    departmentName: row.department_name ?? '',
    roleId: row.role_id ?? '',
    roleName: row.role_name ?? '',
    status: row.status as EmployeeStatus,
  }
}
