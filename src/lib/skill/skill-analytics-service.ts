/**
 * Issue #37 / Req 4.1, 4.2, 4.3: スキル分析サービス
 *
 * - getOrganizationSummary: 組織全体のスキル充足率サマリ (Req 4.1)
 * - getHeatmap:            部署 × スキルカテゴリのマトリクス (Req 4.2)
 * - getEmployeeRadar:      社員個人のレーダーチャートデータ (Req 4.3)
 *
 * 依存は SkillAnalyticsRepository 経由に限定し、Prisma 実装は
 * createPrismaSkillAnalyticsRepository で注入する。テストでは in-memory 実装を差し替え可能。
 */
import type { PrismaClient } from '@prisma/client'
import {
  SKILL_LEVEL_MAX,
  UNASSIGNED_DEPARTMENT_ID,
  UNASSIGNED_DEPARTMENT_NAME,
  emptySkillSummary,
  normalizeLevel,
  type CategoryFulfillment,
  type HeatmapCell,
  type RadarData,
  type RadarDataPoint,
  type SkillHeatmap,
  type SkillSummary,
} from './skill-analytics-types'

// ─────────────────────────────────────────────────────────────────────────────
// Narrow repository port (Prisma から必要なレコードだけを取得する)
// ─────────────────────────────────────────────────────────────────────────────

/** リポジトリが返すスキル取得レコード */
export interface EmployeeSkillRow {
  readonly id: string
  readonly userId: string
  readonly skillId: string
  readonly level: number
  readonly approved: boolean
}

/** リポジトリが返す SkillMaster サブセット */
export interface SkillMasterRow {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly deprecated: boolean
}

/** リポジトリが返す部署情報付き社員 */
export interface EmployeeRow {
  readonly userId: string
  readonly departmentId: string | null
  readonly departmentName: string | null
}

export interface SkillAnalyticsRepository {
  listEmployeeSkills(): Promise<EmployeeSkillRow[]>
  listEmployeeSkillsByUser(userId: string): Promise<EmployeeSkillRow[]>
  listSkillMasters(): Promise<SkillMasterRow[]>
  listEmployeesWithDepartment(): Promise<EmployeeRow[]>
  countActiveEmployees(): Promise<number>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service port
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillAnalyticsService {
  getOrganizationSummary(): Promise<SkillSummary>
  getHeatmap(): Promise<SkillHeatmap>
  getEmployeeRadar(userId: string): Promise<RadarData>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service implementation
// ─────────────────────────────────────────────────────────────────────────────

class SkillAnalyticsServiceImpl implements SkillAnalyticsService {
  constructor(private readonly repo: SkillAnalyticsRepository) {}

  async getOrganizationSummary(): Promise<SkillSummary> {
    const [skills, masters, totalEmployees] = await Promise.all([
      this.repo.listEmployeeSkills(),
      this.repo.listSkillMasters(),
      this.repo.countActiveEmployees(),
    ])

    if (skills.length === 0) {
      return { ...emptySkillSummary(), totalEmployees }
    }

    const categoryById = indexCategory(masters)
    const averageFulfillmentRate = computeAverageFulfillment(skills)
    const topCategories = computeTopCategories(skills, categoryById)

    return {
      totalEmployees,
      totalSkillEntries: skills.length,
      averageFulfillmentRate,
      topCategories,
    }
  }

  async getHeatmap(): Promise<SkillHeatmap> {
    const [skills, masters, employees] = await Promise.all([
      this.repo.listEmployeeSkills(),
      this.repo.listSkillMasters(),
      this.repo.listEmployeesWithDepartment(),
    ])

    const categoryById = indexCategory(masters)
    const employeeIndex = indexEmployees(employees)
    const cells = buildHeatmapCells(skills, categoryById, employeeIndex)

    const departments = uniqueSortedByFirst(cells, (c) => [c.departmentId, c.departmentName])
    const categories = uniqueSorted(cells.map((c) => c.category))

    return {
      cells,
      departments: departments.map((d) => d.name),
      categories,
    }
  }

  async getEmployeeRadar(userId: string): Promise<RadarData> {
    const [skills, masters] = await Promise.all([
      this.repo.listEmployeeSkillsByUser(userId),
      this.repo.listSkillMasters(),
    ])

    const masterById = new Map(masters.map((m) => [m.id, m]))
    const points: RadarDataPoint[] = []
    for (const skill of skills) {
      const master = masterById.get(skill.skillId)
      if (!master || master.deprecated) continue
      points.push({
        skillName: master.name,
        category: master.category,
        currentLevel: clampLevel(skill.level),
        maxLevel: SKILL_LEVEL_MAX,
        approved: skill.approved,
      })
    }

    points.sort((a, b) =>
      a.category === b.category
        ? a.skillName.localeCompare(b.skillName)
        : a.category.localeCompare(b.category),
    )

    return { userId, points }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function indexCategory(masters: readonly SkillMasterRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of masters) out.set(m.id, m.category)
  return out
}

interface IndexedEmployee {
  readonly departmentId: string
  readonly departmentName: string
}

function indexEmployees(employees: readonly EmployeeRow[]): Map<string, IndexedEmployee> {
  const out = new Map<string, IndexedEmployee>()
  for (const e of employees) {
    out.set(e.userId, {
      departmentId: e.departmentId ?? UNASSIGNED_DEPARTMENT_ID,
      departmentName: e.departmentName ?? UNASSIGNED_DEPARTMENT_NAME,
    })
  }
  return out
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0
  if (level >= SKILL_LEVEL_MAX) return SKILL_LEVEL_MAX
  return level
}

function computeAverageFulfillment(skills: readonly EmployeeSkillRow[]): number {
  if (skills.length === 0) return 0
  let sum = 0
  for (const s of skills) sum += normalizeLevel(s.level)
  return sum / skills.length
}

function computeTopCategories(
  skills: readonly EmployeeSkillRow[],
  categoryById: ReadonlyMap<string, string>,
): CategoryFulfillment[] {
  const acc = new Map<string, { total: number; count: number }>()
  for (const s of skills) {
    const category = categoryById.get(s.skillId)
    if (!category) continue
    const prev = acc.get(category) ?? { total: 0, count: 0 }
    prev.total += normalizeLevel(s.level)
    prev.count += 1
    acc.set(category, prev)
  }
  const rows: CategoryFulfillment[] = []
  for (const [category, { total, count }] of acc) {
    rows.push({ category, fulfillmentRate: count === 0 ? 0 : total / count })
  }
  rows.sort((a, b) =>
    b.fulfillmentRate === a.fulfillmentRate
      ? a.category.localeCompare(b.category)
      : b.fulfillmentRate - a.fulfillmentRate,
  )
  return rows.slice(0, 5)
}

interface AggCell {
  total: number
  count: number
  departmentName: string
}

function buildHeatmapCells(
  skills: readonly EmployeeSkillRow[],
  categoryById: ReadonlyMap<string, string>,
  employeeIndex: ReadonlyMap<string, IndexedEmployee>,
): HeatmapCell[] {
  // key = `${departmentId}|${category}`
  const acc = new Map<string, AggCell>()
  const deptIdByKey = new Map<string, string>()
  const categoryByKey = new Map<string, string>()

  for (const s of skills) {
    const category = categoryById.get(s.skillId)
    if (!category) continue
    const emp = employeeIndex.get(s.userId)
    const deptId = emp?.departmentId ?? UNASSIGNED_DEPARTMENT_ID
    const deptName = emp?.departmentName ?? UNASSIGNED_DEPARTMENT_NAME
    const key = `${deptId}|${category}`
    const prev = acc.get(key) ?? { total: 0, count: 0, departmentName: deptName }
    prev.total += s.level
    prev.count += 1
    acc.set(key, prev)
    deptIdByKey.set(key, deptId)
    categoryByKey.set(key, category)
  }

  const cells: HeatmapCell[] = []
  for (const [key, agg] of acc) {
    const departmentId = deptIdByKey.get(key) ?? UNASSIGNED_DEPARTMENT_ID
    const category = categoryByKey.get(key) ?? ''
    cells.push({
      departmentId,
      departmentName: agg.departmentName,
      category,
      averageLevel: agg.count === 0 ? 0 : agg.total / agg.count,
      employeeCount: agg.count,
    })
  }
  cells.sort((a, b) =>
    a.departmentName === b.departmentName
      ? a.category.localeCompare(b.category)
      : a.departmentName.localeCompare(b.departmentName),
  )
  return cells
}

interface NamedId {
  readonly id: string
  readonly name: string
}

function uniqueSortedByFirst<T>(
  items: readonly T[],
  pick: (item: T) => [string, string],
): NamedId[] {
  const seen = new Map<string, string>()
  for (const it of items) {
    const [id, name] = pick(it)
    if (!seen.has(id)) seen.set(id, name)
  }
  return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma delegate shim (schema generation に依存しない narrow 型)
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeSkillPrismaRow {
  id: string
  userId: string
  skillId: string
  level: number
  approvedAt: Date | null
}

interface SkillMasterPrismaRow {
  id: string
  name: string
  category: string
  deprecated: boolean
}

interface UserPrismaRow {
  id: string
  positionId: string | null
  status: string
}

interface PositionPrismaRow {
  id: string
  departmentId: string
}

interface DepartmentPrismaRow {
  id: string
  name: string
  deletedAt: Date | null
}

interface SkillAnalyticsDelegates {
  employeeSkill: {
    findMany(args?: unknown): Promise<EmployeeSkillPrismaRow[]>
  }
  skillMaster: {
    findMany(args?: unknown): Promise<SkillMasterPrismaRow[]>
  }
  user: {
    findMany(args?: unknown): Promise<UserPrismaRow[]>
    count(args?: unknown): Promise<number>
  }
  position: {
    findMany(args?: unknown): Promise<PositionPrismaRow[]>
  }
  department: {
    findMany(args?: unknown): Promise<DepartmentPrismaRow[]>
  }
}

function asDelegates(db: PrismaClient): SkillAnalyticsDelegates {
  return db as unknown as SkillAnalyticsDelegates
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma repository implementation
// ─────────────────────────────────────────────────────────────────────────────

class PrismaSkillAnalyticsRepository implements SkillAnalyticsRepository {
  private readonly d: SkillAnalyticsDelegates

  constructor(db: PrismaClient) {
    this.d = asDelegates(db)
  }

  async listEmployeeSkills(): Promise<EmployeeSkillRow[]> {
    const rows = await this.d.employeeSkill.findMany({})
    return rows.map(mapEmployeeSkill)
  }

  async listEmployeeSkillsByUser(userId: string): Promise<EmployeeSkillRow[]> {
    const rows = await this.d.employeeSkill.findMany({ where: { userId } })
    return rows.map(mapEmployeeSkill)
  }

  async listSkillMasters(): Promise<SkillMasterRow[]> {
    const rows = await this.d.skillMaster.findMany({})
    return rows.map(
      (r): SkillMasterRow => ({
        id: r.id,
        name: r.name,
        category: r.category,
        deprecated: r.deprecated,
      }),
    )
  }

  async listEmployeesWithDepartment(): Promise<EmployeeRow[]> {
    const [users, positions, departments] = await Promise.all([
      this.d.user.findMany({ where: { status: 'ACTIVE' } }),
      this.d.position.findMany({}),
      this.d.department.findMany({ where: { deletedAt: null } }),
    ])
    const deptById = new Map(departments.map((d) => [d.id, d.name]))
    const posById = new Map(positions.map((p) => [p.id, p.departmentId]))

    return users.map((u): EmployeeRow => {
      const departmentId = u.positionId ? (posById.get(u.positionId) ?? null) : null
      const departmentName = departmentId ? (deptById.get(departmentId) ?? null) : null
      return { userId: u.id, departmentId, departmentName }
    })
  }

  async countActiveEmployees(): Promise<number> {
    return this.d.user.count({ where: { status: 'ACTIVE' } })
  }
}

function mapEmployeeSkill(row: EmployeeSkillPrismaRow): EmployeeSkillRow {
  return {
    id: row.id,
    userId: row.userId,
    skillId: row.skillId,
    level: row.level,
    approved: row.approvedAt !== null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

export function createPrismaSkillAnalyticsRepository(
  db: PrismaClient,
): SkillAnalyticsRepository {
  return new PrismaSkillAnalyticsRepository(db)
}

export function createSkillAnalyticsService(
  repo: SkillAnalyticsRepository,
): SkillAnalyticsService {
  return new SkillAnalyticsServiceImpl(repo)
}
