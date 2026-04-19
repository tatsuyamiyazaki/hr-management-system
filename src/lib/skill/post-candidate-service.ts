/**
 * Issue #38 / Req 4.6, 4.7, 4.8: ポスト候補者リストと採用アラート
 *
 * - listCandidatesForPost: 役職要件に対する候補者一覧とスキル充足率 (Req 4.6)
 * - listUnderstaffedPosts: 充足率が閾値を下回るポストの自動アラート (Req 4.7)
 * - getSkillGapRanking:   組織目標に対するスキルギャップランキング (Req 4.8)
 */
import type { PrismaClient } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// Repository row types
// ─────────────────────────────────────────────────────────────────────────────

export interface PositionRow {
  readonly id: string
  readonly roleId: string
  readonly roleName: string
  readonly holderUserId: string | null
}

export interface RoleSkillRequirementRow {
  readonly id: string
  readonly roleId: string
  readonly skillId: string
  readonly skillName: string
  readonly requiredLevel: number
}

export interface EmployeeSkillRow {
  readonly id: string
  readonly userId: string
  readonly skillId: string
  readonly level: number
  readonly approved: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository port
// ─────────────────────────────────────────────────────────────────────────────

export interface PostCandidateRepository {
  listPositions(): Promise<PositionRow[]>
  listPositionById(positionId: string): Promise<PositionRow | null>
  listRoleSkillRequirements(): Promise<RoleSkillRequirementRow[]>
  listEmployeeSkills(): Promise<EmployeeSkillRow[]>
  listActiveUserIds(): Promise<string[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service result types
// ─────────────────────────────────────────────────────────────────────────────

export interface CandidateScore {
  readonly userId: string
  readonly fulfillmentRate: number
  readonly matchedSkills: number
  readonly totalRequired: number
}

export interface PostCandidateResult {
  readonly positionId: string
  readonly roleId: string
  readonly roleName: string
  readonly candidates: CandidateScore[]
  readonly fulfillmentRate: number
}

export interface UnderstaffedPost {
  readonly positionId: string
  readonly roleId: string
  readonly roleName: string
  readonly fulfillmentRate: number
}

export interface SkillGapRankItem {
  readonly skillId: string
  readonly skillName: string
  readonly averageGap: number
  readonly affectedEmployeeCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Service port
// ─────────────────────────────────────────────────────────────────────────────

export interface PostCandidateService {
  listCandidatesForPost(positionId: string): Promise<PostCandidateResult>
  listUnderstaffedPosts(threshold?: number): Promise<UnderstaffedPost[]>
  getSkillGapRanking(): Promise<SkillGapRankItem[]>
}

const DEFAULT_THRESHOLD = 0.6

// ─────────────────────────────────────────────────────────────────────────────
// Service implementation
// ─────────────────────────────────────────────────────────────────────────────

class PostCandidateServiceImpl implements PostCandidateService {
  constructor(private readonly repo: PostCandidateRepository) {}

  async listCandidatesForPost(positionId: string): Promise<PostCandidateResult> {
    const position = await this.repo.listPositionById(positionId)
    if (!position) throw new Error('Position not found')

    const [requirements, employeeSkills, userIds] = await Promise.all([
      this.repo.listRoleSkillRequirements(),
      this.repo.listEmployeeSkills(),
      this.repo.listActiveUserIds(),
    ])

    const roleRequirements = requirements.filter((r) => r.roleId === position.roleId)
    const skillsByUser = groupByUser(employeeSkills)

    const candidates = userIds.map((userId) =>
      scoreCandidateForRole(userId, roleRequirements, skillsByUser.get(userId) ?? []),
    )
    candidates.sort((a, b) => b.fulfillmentRate - a.fulfillmentRate)

    const fulfillmentRate = computeAverageFulfillmentRate(candidates, roleRequirements.length)

    return {
      positionId: position.id,
      roleId: position.roleId,
      roleName: position.roleName,
      candidates,
      fulfillmentRate,
    }
  }

  async listUnderstaffedPosts(threshold = DEFAULT_THRESHOLD): Promise<UnderstaffedPost[]> {
    const [positions, requirements, employeeSkills, userIds] = await Promise.all([
      this.repo.listPositions(),
      this.repo.listRoleSkillRequirements(),
      this.repo.listEmployeeSkills(),
      this.repo.listActiveUserIds(),
    ])

    const requirementsByRole = groupByRole(requirements)
    const skillsByUser = groupByUser(employeeSkills)

    const understaffed: UnderstaffedPost[] = []
    for (const position of positions) {
      const roleRequirements = requirementsByRole.get(position.roleId) ?? []
      const candidates = userIds.map((userId) =>
        scoreCandidateForRole(userId, roleRequirements, skillsByUser.get(userId) ?? []),
      )
      const rate = computeAverageFulfillmentRate(candidates, roleRequirements.length)
      if (rate < threshold) {
        understaffed.push({
          positionId: position.id,
          roleId: position.roleId,
          roleName: position.roleName,
          fulfillmentRate: rate,
        })
      }
    }

    return understaffed
  }

  async getSkillGapRanking(): Promise<SkillGapRankItem[]> {
    const [requirements, employeeSkills, userIds] = await Promise.all([
      this.repo.listRoleSkillRequirements(),
      this.repo.listEmployeeSkills(),
      this.repo.listActiveUserIds(),
    ])

    if (requirements.length === 0 || userIds.length === 0) return []

    const maxRequiredBySkill = computeMaxRequiredBySkill(requirements)
    const skillNameById = buildSkillNameIndex(requirements)
    const skillLevelByUser = buildSkillLevelIndex(employeeSkills)

    const items: SkillGapRankItem[] = []
    for (const [skillId, maxRequired] of maxRequiredBySkill) {
      const { totalGap, affectedCount } = computeGapStats(
        skillId,
        maxRequired,
        userIds,
        skillLevelByUser,
      )
      if (affectedCount === 0) continue
      items.push({
        skillId,
        skillName: skillNameById.get(skillId) ?? skillId,
        averageGap: totalGap / affectedCount,
        affectedEmployeeCount: affectedCount,
      })
    }

    items.sort((a, b) =>
      b.averageGap === a.averageGap
        ? a.skillName.localeCompare(b.skillName)
        : b.averageGap - a.averageGap,
    )

    return items
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function groupByUser(skills: readonly EmployeeSkillRow[]): Map<string, EmployeeSkillRow[]> {
  const out = new Map<string, EmployeeSkillRow[]>()
  for (const s of skills) {
    const list = out.get(s.userId) ?? []
    list.push(s)
    out.set(s.userId, list)
  }
  return out
}

function groupByRole(
  requirements: readonly RoleSkillRequirementRow[],
): Map<string, RoleSkillRequirementRow[]> {
  const out = new Map<string, RoleSkillRequirementRow[]>()
  for (const r of requirements) {
    const list = out.get(r.roleId) ?? []
    list.push(r)
    out.set(r.roleId, list)
  }
  return out
}

function scoreCandidateForRole(
  userId: string,
  requirements: readonly RoleSkillRequirementRow[],
  userSkills: readonly EmployeeSkillRow[],
): CandidateScore {
  const totalRequired = requirements.length
  if (totalRequired === 0) {
    return { userId, fulfillmentRate: 1.0, matchedSkills: 0, totalRequired: 0 }
  }

  const levelBySkill = new Map(userSkills.map((s) => [s.skillId, s.level]))
  let matchedSkills = 0
  for (const req of requirements) {
    const level = levelBySkill.get(req.skillId) ?? 0
    if (level >= req.requiredLevel) matchedSkills++
  }

  return {
    userId,
    fulfillmentRate: matchedSkills / totalRequired,
    matchedSkills,
    totalRequired,
  }
}

function computeAverageFulfillmentRate(
  candidates: readonly CandidateScore[],
  totalRequired: number,
): number {
  if (candidates.length === 0) return totalRequired === 0 ? 1.0 : 0.0
  const sum = candidates.reduce((acc, c) => acc + c.fulfillmentRate, 0)
  return sum / candidates.length
}

function computeMaxRequiredBySkill(
  requirements: readonly RoleSkillRequirementRow[],
): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of requirements) {
    const current = out.get(r.skillId) ?? 0
    if (r.requiredLevel > current) out.set(r.skillId, r.requiredLevel)
  }
  return out
}

function buildSkillNameIndex(
  requirements: readonly RoleSkillRequirementRow[],
): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of requirements) {
    if (!out.has(r.skillId)) out.set(r.skillId, r.skillName)
  }
  return out
}

function buildSkillLevelIndex(
  skills: readonly EmployeeSkillRow[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const s of skills) {
    const userMap = out.get(s.userId) ?? new Map<string, number>()
    userMap.set(s.skillId, s.level)
    out.set(s.userId, userMap)
  }
  return out
}

function computeGapStats(
  skillId: string,
  maxRequired: number,
  userIds: readonly string[],
  skillLevelByUser: ReadonlyMap<string, ReadonlyMap<string, number>>,
): { totalGap: number; affectedCount: number } {
  let totalGap = 0
  let affectedCount = 0
  for (const userId of userIds) {
    const level = skillLevelByUser.get(userId)?.get(skillId) ?? 0
    const gap = maxRequired - level
    if (gap > 0) {
      totalGap += gap
      affectedCount++
    }
  }
  return { totalGap, affectedCount }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma delegate shim
// ─────────────────────────────────────────────────────────────────────────────

interface PositionPrismaRow {
  id: string
  roleId: string
  holderUserId: string | null
  role: { id: string; name: string }
}

interface RoleSkillRequirementPrismaRow {
  id: string
  roleId: string
  skillId: string
  requiredLevel: number
  skill: { id: string; name: string }
}

interface EmployeeSkillPrismaRow {
  id: string
  userId: string
  skillId: string
  level: number
  approvedAt: Date | null
}

interface UserPrismaRow {
  id: string
}

interface PostCandidateDelegates {
  position: {
    findMany(args?: unknown): Promise<PositionPrismaRow[]>
    findUnique(args: unknown): Promise<PositionPrismaRow | null>
  }
  roleSkillRequirement: {
    findMany(args?: unknown): Promise<RoleSkillRequirementPrismaRow[]>
  }
  employeeSkill: {
    findMany(args?: unknown): Promise<EmployeeSkillPrismaRow[]>
  }
  user: {
    findMany(args?: unknown): Promise<UserPrismaRow[]>
  }
}

function asDelegates(db: PrismaClient): PostCandidateDelegates {
  return db as unknown as PostCandidateDelegates
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma repository implementation
// ─────────────────────────────────────────────────────────────────────────────

class PrismaPostCandidateRepository implements PostCandidateRepository {
  private readonly d: PostCandidateDelegates

  constructor(db: PrismaClient) {
    this.d = asDelegates(db)
  }

  async listPositions(): Promise<PositionRow[]> {
    const rows = await this.d.position.findMany({
      include: { role: true },
    })
    return rows.map(mapPosition)
  }

  async listPositionById(positionId: string): Promise<PositionRow | null> {
    const row = await this.d.position.findUnique({
      where: { id: positionId },
      include: { role: true },
    })
    return row ? mapPosition(row) : null
  }

  async listRoleSkillRequirements(): Promise<RoleSkillRequirementRow[]> {
    const rows = await this.d.roleSkillRequirement.findMany({
      include: { skill: true },
    })
    return rows.map(
      (r): RoleSkillRequirementRow => ({
        id: r.id,
        roleId: r.roleId,
        skillId: r.skillId,
        skillName: r.skill.name,
        requiredLevel: r.requiredLevel,
      }),
    )
  }

  async listEmployeeSkills(): Promise<EmployeeSkillRow[]> {
    const rows = await this.d.employeeSkill.findMany({})
    return rows.map(
      (r): EmployeeSkillRow => ({
        id: r.id,
        userId: r.userId,
        skillId: r.skillId,
        level: r.level,
        approved: r.approvedAt !== null,
      }),
    )
  }

  async listActiveUserIds(): Promise<string[]> {
    const rows = await this.d.user.findMany({ where: { status: 'ACTIVE' } })
    return rows.map((r) => r.id)
  }
}

function mapPosition(row: PositionPrismaRow): PositionRow {
  return {
    id: row.id,
    roleId: row.roleId,
    roleName: row.role.name,
    holderUserId: row.holderUserId,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

export function createPrismaPostCandidateRepository(db: PrismaClient): PostCandidateRepository {
  return new PrismaPostCandidateRepository(db)
}

export function createPostCandidateService(repo: PostCandidateRepository): PostCandidateService {
  return new PostCandidateServiceImpl(repo)
}
