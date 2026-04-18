/**
 * Issue #24: マスタ管理サービス
 *
 * - 責務: ドメイン検証 + リポジトリ呼び出し
 */
import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { MasterRepository } from './master-repository'
import {
  MasterNotFoundError,
  assertGradeWeightsSumToOne,
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
// Audit context
// ─────────────────────────────────────────────────────────────────────────────

/** 監査ログに付随する HTTP リクエストコンテキスト (API ルートから渡す) */
export interface MasterAuditContext {
  readonly ipAddress: string
  readonly userAgent: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface MasterService {
  listSkills(includeDeprecated?: boolean): Promise<SkillMaster[]>
  upsertSkill(input: SkillMasterInput): Promise<SkillMaster>
  deprecateSkill(id: SkillMasterId): Promise<void>

  listRoles(): Promise<RoleMaster[]>
  upsertRole(input: RoleMasterInput): Promise<RoleMaster>
  deleteRole(id: RoleMasterId): Promise<void>

  listGrades(): Promise<GradeMaster[]>
  upsertGrade(
    input: GradeMasterInput,
    changedByUserId: string,
    context?: MasterAuditContext,
  ): Promise<GradeMaster>
  deleteGrade(id: GradeMasterId): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface MasterServiceDeps {
  readonly repo: MasterRepository
  readonly auditLogEmitter: AuditLogEmitter
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class MasterServiceImpl implements MasterService {
  private readonly repo: MasterRepository

  constructor(deps: MasterServiceDeps) {
    this.repo = deps.repo
  }

  // ── Skills ────────────────────────────────────────────────────────────────

  async listSkills(includeDeprecated = false): Promise<SkillMaster[]> {
    return this.repo.listSkills(includeDeprecated)
  }

  async upsertSkill(input: SkillMasterInput): Promise<SkillMaster> {
    return this.repo.upsertSkill(input)
  }

  async deprecateSkill(id: SkillMasterId): Promise<void> {
    const existing = await this.repo.findSkillById(id)
    if (!existing) throw new MasterNotFoundError('skill', id)
    await this.repo.deprecateSkill(id)
  }

  // ── Roles ─────────────────────────────────────────────────────────────────

  async listRoles(): Promise<RoleMaster[]> {
    return this.repo.listRoles()
  }

  async upsertRole(input: RoleMasterInput): Promise<RoleMaster> {
    return this.repo.upsertRole(input)
  }

  async deleteRole(id: RoleMasterId): Promise<void> {
    const existing = await this.repo.findRoleById(id)
    if (!existing) throw new MasterNotFoundError('role', id)
    await this.repo.deleteRole(id)
  }

  // ── Grades ────────────────────────────────────────────────────────────────

  async listGrades(): Promise<GradeMaster[]> {
    return this.repo.listGrades()
  }

  async upsertGrade(
    input: GradeMasterInput,
    _changedByUserId: string,
    _context?: MasterAuditContext,
  ): Promise<GradeMaster> {
    // Zod を通らない呼び出し経路でも w1+w2+w3=1 を保証する
    assertGradeWeightsSumToOne(input)
    return this.repo.upsertGrade(input)
  }

  async deleteGrade(id: GradeMasterId): Promise<void> {
    const existing = await this.repo.findGradeById(id)
    if (!existing) throw new MasterNotFoundError('grade', id)
    await this.repo.deleteGrade(id)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createMasterService(deps: MasterServiceDeps): MasterService {
  return new MasterServiceImpl(deps)
}
