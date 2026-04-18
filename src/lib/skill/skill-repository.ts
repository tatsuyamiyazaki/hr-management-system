/**
 * Issue #36 / Task 11.2: 社員スキルリポジトリ (Req 4.4, 4.5)
 *
 * - SkillRepository: EmployeeSkill の CRUD + 承認 + 部下の承認待ち一覧
 * - PrismaSkillRepository: 本番 DB 実装
 *
 * 一意制約違反 (userId, skillId) は SkillAlreadyRegisteredError に、
 * 対象未存在は SkillNotFoundError に正規化する。
 */
import { Prisma, PrismaClient } from '@prisma/client'
import {
  SkillAlreadyRegisteredError,
  SkillNotFoundError,
  toEmployeeSkillId,
  type EmployeeSkill,
  type EmployeeSkillId,
  type EmployeeSkillInput,
} from './skill-types'

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row shape (mirror of generated client)
// ─────────────────────────────────────────────────────────────────────────────

type EmployeeSkillRow = {
  id: string
  userId: string
  skillId: string
  level: number
  acquiredAt: Date
  approvedByManagerId: string | null
  approvedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function mapRow(row: EmployeeSkillRow): EmployeeSkill {
  return {
    id: toEmployeeSkillId(row.id),
    userId: row.userId,
    skillId: row.skillId,
    level: row.level,
    acquiredAt: row.acquiredAt,
    approvedByManagerId: row.approvedByManagerId,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Port
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillRepository {
  /** 指定ユーザーのスキル一覧 (承認済み・未承認を両方含む) */
  listByUser(userId: string): Promise<EmployeeSkill[]>
  findById(id: EmployeeSkillId): Promise<EmployeeSkill | null>
  /**
   * (userId, skillId) 単位で upsert。
   * 承認フィールド (approvedByManagerId / approvedAt) はスキル更新時にクリアし、
   * 再承認が必要な状態に戻す (Req 4.5)。
   */
  upsertSkill(userId: string, input: EmployeeSkillInput): Promise<EmployeeSkill>
  /** 承認日時とマネージャー ID を記録 (Req 4.5) */
  approveSkill(id: EmployeeSkillId, managerId: string, approvedAt: Date): Promise<void>
  /** 指定スキルを削除 (ユーザーが自身のスキルを取り消す用途) */
  deleteSkill(id: EmployeeSkillId): Promise<void>
  /**
   * マネージャーの部下 (supervisorPositionId === managerUserId のポジションの holder) の
   * 承認待ちスキル一覧を返す (Req 4.5)。
   */
  listPendingApproval(managerUserId: string): Promise<EmployeeSkill[]>
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
// Prisma delegate shim (EmployeeSkill モデルは型生成タイミングに依存するため明示)
// ─────────────────────────────────────────────────────────────────────────────

interface SkillDelegates {
  employeeSkill: {
    findMany(args: unknown): Promise<EmployeeSkillRow[]>
    findUnique(args: unknown): Promise<EmployeeSkillRow | null>
    create(args: unknown): Promise<EmployeeSkillRow>
    update(args: unknown): Promise<EmployeeSkillRow>
    delete(args: unknown): Promise<EmployeeSkillRow>
  }
  position: {
    findMany(args: unknown): Promise<Array<{ id: string; holderUserId: string | null }>>
  }
}

function asSkillDelegates(db: PrismaClient): SkillDelegates {
  return db as unknown as SkillDelegates
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma implementation
// ─────────────────────────────────────────────────────────────────────────────

class PrismaSkillRepository implements SkillRepository {
  private readonly delegates: SkillDelegates

  constructor(db: PrismaClient) {
    this.delegates = asSkillDelegates(db)
  }

  async listByUser(userId: string): Promise<EmployeeSkill[]> {
    const rows = await this.delegates.employeeSkill.findMany({
      where: { userId },
      orderBy: [{ acquiredAt: 'desc' }],
    })
    return rows.map(mapRow)
  }

  async findById(id: EmployeeSkillId): Promise<EmployeeSkill | null> {
    const row = await this.delegates.employeeSkill.findUnique({ where: { id } })
    return row ? mapRow(row) : null
  }

  async upsertSkill(userId: string, input: EmployeeSkillInput): Promise<EmployeeSkill> {
    const existing = await this.delegates.employeeSkill.findUnique({
      where: { userId_skillId: { userId, skillId: input.skillId } },
    })

    try {
      if (existing) {
        // 更新時は承認状態をリセット (再承認が必要)
        const row = await this.delegates.employeeSkill.update({
          where: { id: existing.id },
          data: {
            level: input.level,
            acquiredAt: input.acquiredAt,
            approvedByManagerId: null,
            approvedAt: null,
          },
        })
        return mapRow(row)
      }
      const row = await this.delegates.employeeSkill.create({
        data: {
          userId,
          skillId: input.skillId,
          level: input.level,
          acquiredAt: input.acquiredAt,
        },
      })
      return mapRow(row)
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new SkillAlreadyRegisteredError(userId, input.skillId)
      }
      throw err
    }
  }

  async approveSkill(id: EmployeeSkillId, managerId: string, approvedAt: Date): Promise<void> {
    try {
      await this.delegates.employeeSkill.update({
        where: { id },
        data: { approvedByManagerId: managerId, approvedAt },
      })
    } catch (err) {
      if (isRecordNotFound(err)) {
        throw new SkillNotFoundError('employee-skill', id)
      }
      throw err
    }
  }

  async deleteSkill(id: EmployeeSkillId): Promise<void> {
    try {
      await this.delegates.employeeSkill.delete({ where: { id } })
    } catch (err) {
      if (isRecordNotFound(err)) {
        throw new SkillNotFoundError('employee-skill', id)
      }
      throw err
    }
  }

  async listPendingApproval(managerUserId: string): Promise<EmployeeSkill[]> {
    // 1. マネージャーのポジション (holderUserId === managerUserId) を取得
    const managerPositions = await this.delegates.position.findMany({
      where: { holderUserId: managerUserId },
    })
    if (managerPositions.length === 0) return []
    const managerPositionIds = managerPositions.map((p) => p.id)

    // 2. supervisorPositionId がマネージャーのポジションである部下ポジションを取得
    const subordinatePositions = await this.delegates.position.findMany({
      where: { supervisorPositionId: { in: managerPositionIds } },
    })
    const subordinateUserIds = subordinatePositions
      .map((p) => p.holderUserId)
      .filter((id): id is string => id !== null)

    if (subordinateUserIds.length === 0) return []

    // 3. 部下の未承認スキルのみ抽出
    const rows = await this.delegates.employeeSkill.findMany({
      where: {
        userId: { in: subordinateUserIds },
        approvedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }],
    })
    return rows.map(mapRow)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPrismaSkillRepository(db?: PrismaClient): SkillRepository {
  return new PrismaSkillRepository(db ?? new PrismaClient())
}
