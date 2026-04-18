/**
 * Issue #36 / Task 11.2: 社員スキル管理サービス (Req 4.4, 4.5)
 *
 * - 責務:
 *   1. SkillMaster の存在確認 (登録前)
 *   2. SkillRepository への委譲
 *   3. 承認時の監査ログ発行 (4.5)
 *
 * - design.md の契約:
 *   - registerSkill(userId, input): Promise<EmployeeSkill>
 *   - approveSkill(managerId, skillId): Promise<void>
 */
import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { AuditLogEntry } from '@/lib/audit/audit-log-types'
import type { MasterRepository } from '@/lib/master/master-repository'
import { toSkillMasterId } from '@/lib/master/master-types'
import type { SkillRepository } from './skill-repository'
import {
  SkillAccessDeniedError,
  SkillNotFoundError,
  type EmployeeSkill,
  type EmployeeSkillId,
  type EmployeeSkillInput,
} from './skill-types'

// ─────────────────────────────────────────────────────────────────────────────
// Audit context
// ─────────────────────────────────────────────────────────────────────────────

/** 監査ログに付随する HTTP リクエストコンテキスト */
export interface SkillAuditContext {
  readonly ipAddress: string
  readonly userAgent: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface (design.md contract)
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillService {
  /**
   * EMPLOYEE が自分のスキルを登録・更新する (Req 4.4)。
   * - SkillMaster.id の存在を検証 → upsert
   * - upsert 時は承認状態をリセットする (repository 側)
   */
  registerSkill(userId: string, input: EmployeeSkillInput): Promise<EmployeeSkill>

  /**
   * MANAGER が部下のスキルを承認する (Req 4.5)。
   * - 該当スキルの存在を検証
   * - approvedByManagerId / approvedAt を記録
   * - RECORD_UPDATE 監査ログを発行 (before/after スナップショット)
   */
  approveSkill(
    managerId: string,
    skillId: EmployeeSkillId,
    context?: SkillAuditContext,
  ): Promise<void>

  /** 指定ユーザーのスキル一覧 (承認済み・未承認を両方含む) */
  listMySkills(userId: string): Promise<EmployeeSkill[]>

  /** マネージャーの部下の承認待ちスキル一覧 (Req 4.5) */
  listPendingApproval(managerId: string): Promise<EmployeeSkill[]>

  /** スキルを削除。ownerUserId が一致しない場合 SkillAccessDeniedError */
  deleteMySkill(userId: string, skillId: EmployeeSkillId): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillServiceDeps {
  readonly skillRepo: SkillRepository
  readonly masterRepo: MasterRepository
  readonly auditLogEmitter: AuditLogEmitter
  /** 時刻取得の注入 (テスト用)。未指定なら () => new Date() */
  readonly clock?: () => Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

const UNKNOWN_IP = 'unknown'
const UNKNOWN_UA = 'unknown'

function skillToAuditJson(skill: EmployeeSkill): Record<string, unknown> {
  return {
    id: skill.id,
    userId: skill.userId,
    skillId: skill.skillId,
    level: skill.level,
    acquiredAt: skill.acquiredAt.toISOString(),
    approvedByManagerId: skill.approvedByManagerId,
    approvedAt: skill.approvedAt ? skill.approvedAt.toISOString() : null,
  }
}

class SkillServiceImpl implements SkillService {
  private readonly skillRepo: SkillRepository
  private readonly masterRepo: MasterRepository
  private readonly auditLogEmitter: AuditLogEmitter
  private readonly clock: () => Date

  constructor(deps: SkillServiceDeps) {
    this.skillRepo = deps.skillRepo
    this.masterRepo = deps.masterRepo
    this.auditLogEmitter = deps.auditLogEmitter
    this.clock = deps.clock ?? ((): Date => new Date())
  }

  async registerSkill(userId: string, input: EmployeeSkillInput): Promise<EmployeeSkill> {
    // Req 4.4: SkillMaster の存在を確認
    const master = await this.masterRepo.findSkillById(toSkillMasterId(input.skillId))
    if (!master) {
      throw new SkillNotFoundError('master', input.skillId)
    }
    return this.skillRepo.upsertSkill(userId, input)
  }

  async approveSkill(
    managerId: string,
    skillId: EmployeeSkillId,
    context?: SkillAuditContext,
  ): Promise<void> {
    const before = await this.skillRepo.findById(skillId)
    if (!before) {
      throw new SkillNotFoundError('employee-skill', skillId)
    }
    // マネージャーが自分自身のスキルを承認することは禁止 (Req 4.5)
    if (before.userId === managerId) {
      throw new SkillAccessDeniedError('not-subordinate')
    }

    const approvedAt = this.clock()
    await this.skillRepo.approveSkill(skillId, managerId, approvedAt)

    const after: EmployeeSkill = {
      ...before,
      approvedByManagerId: managerId,
      approvedAt,
    }

    const entry: AuditLogEntry = {
      userId: managerId,
      action: 'RECORD_UPDATE',
      resourceType: 'MASTER_DATA',
      resourceId: skillId,
      ipAddress: context?.ipAddress ?? UNKNOWN_IP,
      userAgent: context?.userAgent ?? UNKNOWN_UA,
      before: skillToAuditJson(before),
      after: skillToAuditJson(after),
    }
    await this.auditLogEmitter.emit(entry)
  }

  async listMySkills(userId: string): Promise<EmployeeSkill[]> {
    return this.skillRepo.listByUser(userId)
  }

  async listPendingApproval(managerId: string): Promise<EmployeeSkill[]> {
    return this.skillRepo.listPendingApproval(managerId)
  }

  async deleteMySkill(userId: string, skillId: EmployeeSkillId): Promise<void> {
    const existing = await this.skillRepo.findById(skillId)
    if (!existing) {
      throw new SkillNotFoundError('employee-skill', skillId)
    }
    if (existing.userId !== userId) {
      throw new SkillAccessDeniedError('not-owner')
    }
    await this.skillRepo.deleteSkill(skillId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createSkillService(deps: SkillServiceDeps): SkillService {
  return new SkillServiceImpl(deps)
}
