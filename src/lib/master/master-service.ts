/**
 * Issue #24 / #25: マスタ管理サービス
 *
 * - 責務: ドメイン検証 + リポジトリ呼び出し + 監査ログ発行
 * - #25: 等級ウェイト変更時は GradeWeightHistory + MASTER_DATA_CHANGE 監査ログを発行
 */
import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { AuditLogEntry } from '@/lib/audit/audit-log-types'
import type { GradeWeightHistoryEntry, MasterRepository } from './master-repository'
import {
  MasterNotFoundError,
  assertGradeWeightsSumToOne,
  isSameGradeWeights,
  toGradeWeightSnapshot,
  type GradeMaster,
  type GradeMasterId,
  type GradeMasterInput,
  type GradeWeightSnapshot,
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
  /**
   * 既存 grade のウェイトが変わる場合、GradeWeightHistory と
   * MASTER_DATA_CHANGE 監査ログを発行する (Req 2.6 / #25)。
   */
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

const UNKNOWN_IP = 'unknown'
const UNKNOWN_UA = 'unknown'

function snapshotToRecord(snapshot: GradeWeightSnapshot): Record<string, unknown> {
  return {
    label: snapshot.label,
    performanceWeight: snapshot.performanceWeight,
    goalWeight: snapshot.goalWeight,
    feedbackWeight: snapshot.feedbackWeight,
  }
}

class MasterServiceImpl implements MasterService {
  private readonly repo: MasterRepository
  private readonly auditLogEmitter: AuditLogEmitter

  constructor(deps: MasterServiceDeps) {
    this.repo = deps.repo
    this.auditLogEmitter = deps.auditLogEmitter
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
    changedByUserId: string,
    context?: MasterAuditContext,
  ): Promise<GradeMaster> {
    // Zod を通らない呼び出し経路でも w1+w2+w3=1 を保証する
    assertGradeWeightsSumToOne(input)

    const before = input.id ? await this.repo.findGradeById(input.id as GradeMasterId) : null

    const updated = await this.repo.upsertGrade(input)

    // 既存 grade のウェイトが変化したときのみ履歴 + 監査ログを発行 (Req 2.6 / #25)
    if (before) {
      const beforeSnap = toGradeWeightSnapshot(before)
      const afterSnap = toGradeWeightSnapshot(updated)
      if (!isSameGradeWeights(beforeSnap, afterSnap)) {
        await this.recordGradeWeightChange({
          gradeId: updated.id,
          changedBy: changedByUserId,
          before: beforeSnap,
          after: afterSnap,
          context,
        })
      }
    }

    return updated
  }

  async deleteGrade(id: GradeMasterId): Promise<void> {
    const existing = await this.repo.findGradeById(id)
    if (!existing) throw new MasterNotFoundError('grade', id)
    await this.repo.deleteGrade(id)
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async recordGradeWeightChange(params: {
    gradeId: GradeMasterId
    changedBy: string
    before: GradeWeightSnapshot
    after: GradeWeightSnapshot
    context: MasterAuditContext | undefined
  }): Promise<void> {
    const historyEntry: GradeWeightHistoryEntry = {
      gradeId: params.gradeId,
      changedBy: params.changedBy,
      beforeJson: snapshotToRecord(params.before),
      afterJson: snapshotToRecord(params.after),
    }
    await this.repo.recordGradeWeightHistory(historyEntry)

    const auditEntry: AuditLogEntry = {
      userId: params.changedBy,
      action: 'MASTER_DATA_CHANGE',
      resourceType: 'MASTER_DATA',
      resourceId: params.gradeId,
      ipAddress: params.context?.ipAddress ?? UNKNOWN_IP,
      userAgent: params.context?.userAgent ?? UNKNOWN_UA,
      before: snapshotToRecord(params.before),
      after: snapshotToRecord(params.after),
    }
    await this.auditLogEmitter.emit(auditEntry)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createMasterService(deps: MasterServiceDeps): MasterService {
  return new MasterServiceImpl(deps)
}
