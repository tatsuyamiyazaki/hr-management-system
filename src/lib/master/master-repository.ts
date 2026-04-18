/**
 * Issue #24: マスタ管理リポジトリ
 *
 * - MasterRepository: skill / role / grade の narrow port
 * - PrismaMasterRepository: 本番 DB 実装
 *
 * 一意制約違反 (name) は MasterNameConflictError に正規化し、
 * 存在しない更新対象は MasterNotFoundError に正規化する。
 */
import { PrismaClient, Prisma } from '@prisma/client'
import {
  MasterNameConflictError,
  MasterNotFoundError,
  toGradeMasterId,
  toRoleMasterId,
  toSkillMasterId,
  type GradeMaster,
  type GradeMasterId,
  type GradeMasterInput,
  type RoleMaster,
  type RoleMasterId,
  type RoleMasterInput,
  type SkillMaster,
  type SkillMasterId,
  type SkillMasterInput,
} from './master-types'

// ─────────────────────────────────────────────────────────────────────────────
// Port
// ─────────────────────────────────────────────────────────────────────────────

export interface MasterRepository {
  // Skills (Req 2.1, 2.4)
  listSkills(includeDeprecated?: boolean): Promise<SkillMaster[]>
  findSkillById(id: SkillMasterId): Promise<SkillMaster | null>
  upsertSkill(input: SkillMasterInput): Promise<SkillMaster>
  deprecateSkill(id: SkillMasterId): Promise<void>

  // Roles (Req 2.2, 2.5)
  listRoles(): Promise<RoleMaster[]>
  findRoleById(id: RoleMasterId): Promise<RoleMaster | null>
  upsertRole(input: RoleMasterInput): Promise<RoleMaster>
  deleteRole(id: RoleMasterId): Promise<void>

  // Grades (Req 2.3, 2.6)
  listGrades(): Promise<GradeMaster[]>
  findGradeById(id: GradeMasterId): Promise<GradeMaster | null>
  upsertGrade(input: GradeMasterInput): Promise<GradeMaster>
  deleteGrade(id: GradeMasterId): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row shapes (mirror of generated client)
// ─────────────────────────────────────────────────────────────────────────────

type SkillRow = {
  id: string
  name: string
  category: string
  description: string | null
  deprecated: boolean
  createdAt: Date
}

type GradeRow = {
  id: string
  label: string
  performanceWeight: number
  goalWeight: number
  feedbackWeight: number
}

type RoleRow = {
  id: string
  name: string
  gradeId: string
  skillRequirements: Array<{
    roleId: string
    skillId: string
    requiredLevel: number
  }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapSkill(row: SkillRow): SkillMaster {
  return {
    id: toSkillMasterId(row.id),
    name: row.name,
    category: row.category,
    description: row.description,
    deprecated: row.deprecated,
    createdAt: row.createdAt,
  }
}

function mapGrade(row: GradeRow): GradeMaster {
  return {
    id: toGradeMasterId(row.id),
    label: row.label,
    performanceWeight: row.performanceWeight,
    goalWeight: row.goalWeight,
    feedbackWeight: row.feedbackWeight,
  }
}

function mapRole(row: RoleRow): RoleMaster {
  return {
    id: toRoleMasterId(row.id),
    name: row.name,
    gradeId: toGradeMasterId(row.gradeId),
    skillRequirements: row.skillRequirements.map((r) => ({
      skillId: toSkillMasterId(r.skillId),
      requiredLevel: r.requiredLevel,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma error normalization
// ─────────────────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma implementation
// ─────────────────────────────────────────────────────────────────────────────

class PrismaMasterRepository implements MasterRepository {
  constructor(private readonly db: PrismaClient) {}

  // ── Skills ────────────────────────────────────────────────────────────────

  async listSkills(includeDeprecated = false): Promise<SkillMaster[]> {
    const where = includeDeprecated ? {} : { deprecated: false }
    const rows = await this.db.skillMaster.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
    return rows.map(mapSkill)
  }

  async findSkillById(id: SkillMasterId): Promise<SkillMaster | null> {
    const row = await this.db.skillMaster.findUnique({ where: { id } })
    return row ? mapSkill(row) : null
  }

  async upsertSkill(input: SkillMasterInput): Promise<SkillMaster> {
    const { id, name, category, description, deprecated } = input
    try {
      if (id) {
        const row = await this.db.skillMaster.update({
          where: { id },
          data: {
            name,
            category,
            description: description ?? null,
            ...(deprecated !== undefined ? { deprecated } : {}),
          },
        })
        return mapSkill(row)
      }
      const row = await this.db.skillMaster.create({
        data: {
          name,
          category,
          description: description ?? null,
          deprecated: deprecated ?? false,
        },
      })
      return mapSkill(row)
    } catch (err) {
      if (isUniqueViolation(err)) throw new MasterNameConflictError('skill', name)
      if (isRecordNotFound(err) && id) throw new MasterNotFoundError('skill', id)
      throw err
    }
  }

  async deprecateSkill(id: SkillMasterId): Promise<void> {
    try {
      await this.db.skillMaster.update({
        where: { id },
        data: { deprecated: true },
      })
    } catch (err) {
      if (isRecordNotFound(err)) throw new MasterNotFoundError('skill', id)
      throw err
    }
  }

  // ── Roles ─────────────────────────────────────────────────────────────────

  async listRoles(): Promise<RoleMaster[]> {
    const rows = await this.db.roleMaster.findMany({
      include: { skillRequirements: true },
      orderBy: { name: 'asc' },
    })
    return rows.map(mapRole)
  }

  async findRoleById(id: RoleMasterId): Promise<RoleMaster | null> {
    const row = await this.db.roleMaster.findUnique({
      where: { id },
      include: { skillRequirements: true },
    })
    return row ? mapRole(row) : null
  }

  /**
   * skillRequirements は all-replace 方式。
   * 部分更新 (個別 upsert) だと (roleId, skillId) の unique 制約で競合しうるため、
   * 既存行を deleteMany → create の順で置き換える。
   */
  async upsertRole(input: RoleMasterInput): Promise<RoleMaster> {
    const { id, name, gradeId, skillRequirements } = input
    try {
      const row = await this.db.$transaction(async (tx) => {
        if (id) {
          await tx.roleSkillRequirement.deleteMany({ where: { roleId: id } })
          const updated = await tx.roleMaster.update({
            where: { id },
            data: {
              name,
              gradeId,
              skillRequirements: {
                create: skillRequirements.map((req) => ({
                  skillId: req.skillId,
                  requiredLevel: req.requiredLevel,
                })),
              },
            },
            include: { skillRequirements: true },
          })
          return updated
        }
        const created = await tx.roleMaster.create({
          data: {
            name,
            gradeId,
            skillRequirements: {
              create: skillRequirements.map((req) => ({
                skillId: req.skillId,
                requiredLevel: req.requiredLevel,
              })),
            },
          },
          include: { skillRequirements: true },
        })
        return created
      })
      return mapRole(row)
    } catch (err) {
      if (isUniqueViolation(err)) throw new MasterNameConflictError('role', name)
      if (isRecordNotFound(err) && id) throw new MasterNotFoundError('role', id)
      throw err
    }
  }

  async deleteRole(id: RoleMasterId): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.roleSkillRequirement.deleteMany({ where: { roleId: id } })
        await tx.roleMaster.delete({ where: { id } })
      })
    } catch (err) {
      if (isRecordNotFound(err)) throw new MasterNotFoundError('role', id)
      throw err
    }
  }

  // ── Grades ────────────────────────────────────────────────────────────────

  async listGrades(): Promise<GradeMaster[]> {
    const rows = await this.db.gradeMaster.findMany({
      orderBy: { label: 'asc' },
    })
    return rows.map(mapGrade)
  }

  async findGradeById(id: GradeMasterId): Promise<GradeMaster | null> {
    const row = await this.db.gradeMaster.findUnique({ where: { id } })
    return row ? mapGrade(row) : null
  }

  async upsertGrade(input: GradeMasterInput): Promise<GradeMaster> {
    const { id, label, performanceWeight, goalWeight, feedbackWeight } = input
    try {
      if (id) {
        const row = await this.db.gradeMaster.update({
          where: { id },
          data: { label, performanceWeight, goalWeight, feedbackWeight },
        })
        return mapGrade(row)
      }
      const row = await this.db.gradeMaster.create({
        data: { label, performanceWeight, goalWeight, feedbackWeight },
      })
      return mapGrade(row)
    } catch (err) {
      if (isUniqueViolation(err)) throw new MasterNameConflictError('grade', label)
      if (isRecordNotFound(err) && id) throw new MasterNotFoundError('grade', id)
      throw err
    }
  }

  async deleteGrade(id: GradeMasterId): Promise<void> {
    try {
      await this.db.gradeMaster.delete({ where: { id } })
    } catch (err) {
      if (isRecordNotFound(err)) throw new MasterNotFoundError('grade', id)
      throw err
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPrismaMasterRepository(db?: PrismaClient): MasterRepository {
  return new PrismaMasterRepository(db ?? new PrismaClient())
}
