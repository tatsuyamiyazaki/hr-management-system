/**
 * Issue #40 / Req 5.1, 5.3, 5.4: キャリアマップとギャップ表示サービス
 *
 * - listRoles:              組織内の全役職一覧とスキル要件 (Req 5.1)
 * - calculateCareerGap:    現役職 → 希望役職のスキルギャップ計算 (Req 5.3)
 * - listSubordinateWishes: MANAGER が部下のキャリア希望一覧を取得 (Req 5.4)
 */
import type { PrismaClient } from '@prisma/client'
import {
  calculateFulfillmentRate,
  calculateGap,
  type EmployeeSkill,
} from '@/lib/shared/skill-gap-calculator'
import type { CareerGapResult, RoleNode, SkillGapItem, SubordinateWish } from './career-map-types'
import { toCareerWishId, type CareerWish } from './career-wish-types'

// ─────────────────────────────────────────────────────────────────────────────
// Repository port
// ─────────────────────────────────────────────────────────────────────────────

export interface RoleMasterRow {
  readonly id: string
  readonly name: string
}

export interface RoleSkillRequirementRow {
  readonly roleId: string
  readonly skillId: string
  readonly requiredLevel: number
  readonly skillName: string
}

export interface EmployeeSkillRow {
  readonly skillId: string
  readonly level: number
  readonly acquiredAt: Date
  readonly approvedAt: Date | null
}

export interface UserPositionRow {
  readonly userId: string
  readonly positionId: string | null
  readonly roleId: string | null
  readonly name: string | null
}

export interface SubordinateRow {
  readonly userId: string
  readonly positionId: string | null
  readonly roleId: string | null
  readonly name: string | null
}

export interface CareerMapRepository {
  listRoles(): Promise<RoleMasterRow[]>
  listRoleSkillRequirements(): Promise<RoleSkillRequirementRow[]>
  getEmployeeSkills(userId: string): Promise<EmployeeSkillRow[]>
  getUserPosition(userId: string): Promise<UserPositionRow | null>
  getActiveCareerWish(userId: string): Promise<CareerWish | null>
  listSubordinates(managerPositionId: string): Promise<SubordinateRow[]>
  getManagerPositionId(managerId: string): Promise<string | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service port
// ─────────────────────────────────────────────────────────────────────────────

export interface CareerMapService {
  listRoles(): Promise<RoleNode[]>
  calculateCareerGap(userId: string, desiredRoleId: string): Promise<CareerGapResult>
  listSubordinateWishes(managerId: string): Promise<SubordinateWish[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service implementation
// ─────────────────────────────────────────────────────────────────────────────

class CareerMapServiceImpl implements CareerMapService {
  constructor(private readonly repo: CareerMapRepository) {}

  async listRoles(): Promise<RoleNode[]> {
    const [roles, requirements] = await Promise.all([
      this.repo.listRoles(),
      this.repo.listRoleSkillRequirements(),
    ])

    const reqByRole = groupByRole(requirements)

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      skillRequirements: (reqByRole.get(role.id) ?? []).map((r) => ({
        skillId: r.skillId,
        skillName: r.skillName,
        requiredLevel: r.requiredLevel,
      })),
    }))
  }

  async calculateCareerGap(userId: string, desiredRoleId: string): Promise<CareerGapResult> {
    const [userPosition, employeeSkillRows, requirements] = await Promise.all([
      this.repo.getUserPosition(userId),
      this.repo.getEmployeeSkills(userId),
      this.repo.listRoleSkillRequirements(),
    ])

    const currentRoleId = userPosition?.roleId ?? null
    const roleReqs = requirements.filter((r) => r.roleId === desiredRoleId)

    const holderSkills: EmployeeSkill[] = employeeSkillRows.map((s) => ({
      id: `${userId}-${s.skillId}`,
      userId,
      skillId: s.skillId,
      level: s.level,
      acquiredAt: s.acquiredAt,
      approvedByManagerId: null,
      approvedAt: s.approvedAt,
    }))

    const requiredSkills = roleReqs.map((r) => ({
      skillId: r.skillId,
      requiredLevel: r.requiredLevel,
      skillName: r.skillName,
    }))

    const calcInput = { holderSkills, requiredSkills }
    const gapResults = calculateGap(calcInput)
    const fulfillmentRate = calculateFulfillmentRate(calcInput)

    const gaps: SkillGapItem[] = gapResults.map((g) => ({
      skillId: g.skillId,
      skillName: g.skillName,
      requiredLevel: g.requiredLevel,
      actualLevel: g.currentLevel,
      gap: g.gap,
    }))

    const totalGap = gaps.reduce((sum, g) => sum + g.gap, 0)

    return { currentRoleId, desiredRoleId, gaps, totalGap, fulfillmentRate }
  }

  async listSubordinateWishes(managerId: string): Promise<SubordinateWish[]> {
    const managerPositionId = await this.repo.getManagerPositionId(managerId)
    if (!managerPositionId) return []

    const [subordinates, requirements] = await Promise.all([
      this.repo.listSubordinates(managerPositionId),
      this.repo.listRoleSkillRequirements(),
    ])

    const wishes = await Promise.all(
      subordinates.map((sub) => this.buildSubordinateWish(sub, requirements)),
    )

    return wishes.filter((w): w is SubordinateWish => w !== null)
  }

  private async buildSubordinateWish(
    sub: SubordinateRow,
    requirements: RoleSkillRequirementRow[],
  ): Promise<SubordinateWish | null> {
    const wish = await this.repo.getActiveCareerWish(sub.userId)
    if (!wish) return null

    const employeeSkillRows = await this.repo.getEmployeeSkills(sub.userId)
    const holderSkills: EmployeeSkill[] = employeeSkillRows.map((s) => ({
      id: `${sub.userId}-${s.skillId}`,
      userId: sub.userId,
      skillId: s.skillId,
      level: s.level,
      acquiredAt: s.acquiredAt,
      approvedByManagerId: null,
      approvedAt: s.approvedAt,
    }))

    const roleReqs = requirements.filter((r) => r.roleId === wish.desiredRoleId)
    const requiredSkills = roleReqs.map((r) => ({
      skillId: r.skillId,
      requiredLevel: r.requiredLevel,
    }))

    const fulfillmentRate = calculateFulfillmentRate({ holderSkills, requiredSkills })

    return {
      userId: sub.userId,
      userName: sub.name ?? undefined,
      currentRoleId: sub.roleId,
      desiredRoleId: wish.desiredRoleId,
      desiredRoleName: wish.desiredRoleName,
      desiredAt: wish.desiredAt,
      fulfillmentRate,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function groupByRole(
  requirements: readonly RoleSkillRequirementRow[],
): Map<string, RoleSkillRequirementRow[]> {
  const map = new Map<string, RoleSkillRequirementRow[]>()
  for (const req of requirements) {
    const list = map.get(req.roleId) ?? []
    list.push(req)
    map.set(req.roleId, list)
  }
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma narrow types
// ─────────────────────────────────────────────────────────────────────────────

interface PrismaRoleMaster {
  id: string
  name: string
}

interface PrismaRoleSkillRequirement {
  roleId: string
  skillId: string
  requiredLevel: number
  skill?: { name: string } | null
}

interface PrismaEmployeeSkill {
  skillId: string
  level: number
  acquiredAt: Date
  approvedAt: Date | null
}

interface PrismaPosition {
  id: string
  roleId: string
  supervisorPositionId: string | null
}

interface PrismaUser {
  id: string
  positionId: string | null
  name?: string | null
  status?: string
}

interface PrismaCareerWish {
  id: string
  userId: string
  desiredRoleId: string
  desiredAt: Date
  comment: string | null
  supersededAt: Date | null
  createdAt: Date
  role?: { name: string } | null
}

interface CareerMapDelegates {
  roleMaster: {
    findMany(args?: unknown): Promise<PrismaRoleMaster[]>
  }
  roleSkillRequirement: {
    findMany(args?: unknown): Promise<PrismaRoleSkillRequirement[]>
  }
  employeeSkill: {
    findMany(args?: unknown): Promise<PrismaEmployeeSkill[]>
  }
  position: {
    findUnique(args: unknown): Promise<PrismaPosition | null>
    findMany(args?: unknown): Promise<PrismaPosition[]>
  }
  user: {
    findUnique(args: unknown): Promise<PrismaUser | null>
    findMany(args?: unknown): Promise<PrismaUser[]>
  }
  careerWish: {
    findFirst(args?: unknown): Promise<PrismaCareerWish | null>
  }
}

function asDelegates(db: PrismaClient): CareerMapDelegates {
  return db as unknown as CareerMapDelegates
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma repository implementation
// ─────────────────────────────────────────────────────────────────────────────

class PrismaCareerMapRepository implements CareerMapRepository {
  private readonly d: CareerMapDelegates

  constructor(db: PrismaClient) {
    this.d = asDelegates(db)
  }

  async listRoles(): Promise<RoleMasterRow[]> {
    const rows = await this.d.roleMaster.findMany({})
    return rows.map((r) => ({ id: r.id, name: r.name }))
  }

  async listRoleSkillRequirements(): Promise<RoleSkillRequirementRow[]> {
    const rows = await this.d.roleSkillRequirement.findMany({
      include: { skill: { select: { name: true } } },
    })
    return rows.map((r) => ({
      roleId: r.roleId,
      skillId: r.skillId,
      requiredLevel: r.requiredLevel,
      skillName: r.skill?.name ?? '',
    }))
  }

  async getEmployeeSkills(userId: string): Promise<EmployeeSkillRow[]> {
    const rows = await this.d.employeeSkill.findMany({ where: { userId } })
    return rows.map((r) => ({
      skillId: r.skillId,
      level: r.level,
      acquiredAt: r.acquiredAt,
      approvedAt: r.approvedAt,
    }))
  }

  async getUserPosition(userId: string): Promise<UserPositionRow | null> {
    const user = await this.d.user.findUnique({ where: { id: userId } })
    if (!user) return null
    if (!user.positionId) return { userId, positionId: null, roleId: null, name: null }

    const position = await this.d.position.findUnique({ where: { id: user.positionId } })
    return {
      userId,
      positionId: user.positionId,
      roleId: position?.roleId ?? null,
      name: null,
    }
  }

  async getActiveCareerWish(userId: string): Promise<CareerWish | null> {
    const row = await this.d.careerWish.findFirst({
      where: { userId, supersededAt: null },
      include: { role: { select: { name: true } } },
      orderBy: { desiredAt: 'desc' },
    })
    if (!row) return null
    return {
      id: toCareerWishId(row.id),
      userId: row.userId,
      desiredRoleId: row.desiredRoleId,
      desiredRoleName: row.role?.name ?? '',
      desiredAt: row.desiredAt,
      comment: row.comment,
      supersededAt: row.supersededAt,
      createdAt: row.createdAt,
    }
  }

  async getManagerPositionId(managerId: string): Promise<string | null> {
    const user = await this.d.user.findUnique({ where: { id: managerId } })
    return user?.positionId ?? null
  }

  async listSubordinates(managerPositionId: string): Promise<SubordinateRow[]> {
    const subPositions = await this.d.position.findMany({
      where: { supervisorPositionId: managerPositionId },
    })
    if (subPositions.length === 0) return []

    const positionIds = subPositions.map((p) => p.id)
    const users = await this.d.user.findMany({
      where: { positionId: { in: positionIds }, status: 'ACTIVE' } as unknown,
    })

    return users.map((u) => {
      const pos = subPositions.find((p) => p.id === u.positionId)
      return {
        userId: u.id,
        positionId: u.positionId ?? null,
        roleId: pos?.roleId ?? null,
        name: u.name ?? null,
      }
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

export function createPrismaCareerMapRepository(db: PrismaClient): CareerMapRepository {
  return new PrismaCareerMapRepository(db)
}

export function createCareerMapService(repo: CareerMapRepository): CareerMapService {
  return new CareerMapServiceImpl(repo)
}
