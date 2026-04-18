/**
 * Issue #24 / #25: MasterService の単体テスト
 *
 * repo と auditLogEmitter を vi.fn() でモックし、以下の振る舞いを検証する:
 * - upsertSkill / deprecateSkill / upsertRole / upsertGrade
 * - upsertGrade でウェイトが変化したら GradeWeightHistory と
 *   MASTER_DATA_CHANGE 監査ログが発行されること (#25)
 * - 存在しない資源を操作したら MasterNotFoundError がスローされること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import { createMasterService } from '@/lib/master/master-service'
import type { MasterRepository } from '@/lib/master/master-repository'
import {
  GradeWeightSumError,
  MasterNotFoundError,
  toGradeMasterId,
  toRoleMasterId,
  toSkillMasterId,
  type GradeMaster,
  type RoleMaster,
  type SkillMaster,
} from '@/lib/master/master-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_USER = 'admin-1'

function makeSkill(overrides: Partial<SkillMaster> = {}): SkillMaster {
  return {
    id: toSkillMasterId('skill-1'),
    name: 'TypeScript',
    category: 'language',
    description: null,
    deprecated: false,
    createdAt: new Date('2026-04-18T00:00:00.000Z'),
    ...overrides,
  }
}

function makeRole(overrides: Partial<RoleMaster> = {}): RoleMaster {
  return {
    id: toRoleMasterId('role-1'),
    name: 'Engineer',
    gradeId: toGradeMasterId('grade-1'),
    skillRequirements: [],
    ...overrides,
  }
}

function makeGrade(overrides: Partial<GradeMaster> = {}): GradeMaster {
  return {
    id: toGradeMasterId('grade-1'),
    label: 'G3',
    performanceWeight: 0.5,
    goalWeight: 0.3,
    feedbackWeight: 0.2,
    ...overrides,
  }
}

function makeRepoMock(): MasterRepository {
  return {
    listSkills: vi.fn().mockResolvedValue([]),
    findSkillById: vi.fn().mockResolvedValue(null),
    upsertSkill: vi.fn().mockResolvedValue(makeSkill()),
    deprecateSkill: vi.fn().mockResolvedValue(undefined),
    listRoles: vi.fn().mockResolvedValue([]),
    findRoleById: vi.fn().mockResolvedValue(null),
    upsertRole: vi.fn().mockResolvedValue(makeRole()),
    deleteRole: vi.fn().mockResolvedValue(undefined),
    listGrades: vi.fn().mockResolvedValue([]),
    findGradeById: vi.fn().mockResolvedValue(null),
    upsertGrade: vi.fn().mockResolvedValue(makeGrade()),
    deleteGrade: vi.fn().mockResolvedValue(undefined),
    recordGradeWeightHistory: vi.fn().mockResolvedValue(undefined),
  }
}

function makeEmitterMock(): AuditLogEmitter {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

function makeService(repo = makeRepoMock(), emitter = makeEmitterMock()) {
  const svc = createMasterService({ repo, auditLogEmitter: emitter })
  return { svc, repo, emitter }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────────────────────

describe('MasterService - skills', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upsertSkill は repo に委譲し、作成結果を返す', async () => {
    const created = makeSkill({ name: 'Rust' })
    const repo = makeRepoMock()
    repo.upsertSkill = vi.fn().mockResolvedValue(created)
    const { svc } = makeService(repo)

    const result = await svc.upsertSkill({ name: 'Rust', category: 'language' })

    expect(result).toEqual(created)
    expect(repo.upsertSkill).toHaveBeenCalledWith({ name: 'Rust', category: 'language' })
  })

  it('deprecateSkill は該当 skill がなければ MasterNotFoundError', async () => {
    const repo = makeRepoMock()
    repo.findSkillById = vi.fn().mockResolvedValue(null)
    const { svc } = makeService(repo)

    await expect(svc.deprecateSkill(toSkillMasterId('missing'))).rejects.toBeInstanceOf(
      MasterNotFoundError,
    )
    expect(repo.deprecateSkill).not.toHaveBeenCalled()
  })

  it('deprecateSkill は該当 skill があれば repo を呼ぶ', async () => {
    const repo = makeRepoMock()
    repo.findSkillById = vi.fn().mockResolvedValue(makeSkill())
    const { svc } = makeService(repo)

    await svc.deprecateSkill(toSkillMasterId('skill-1'))

    expect(repo.deprecateSkill).toHaveBeenCalledWith('skill-1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────────────────────

describe('MasterService - roles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upsertRole は repo に委譲し、永続化された role を返す', async () => {
    const persisted = makeRole({ name: 'Senior Engineer' })
    const repo = makeRepoMock()
    repo.upsertRole = vi.fn().mockResolvedValue(persisted)
    const { svc } = makeService(repo)

    const result = await svc.upsertRole({
      name: 'Senior Engineer',
      gradeId: 'grade-1',
      skillRequirements: [{ skillId: 'skill-1', requiredLevel: 4 }],
    })

    expect(result).toEqual(persisted)
    expect(repo.upsertRole).toHaveBeenCalledOnce()
  })

  it('deleteRole は該当 role がなければ MasterNotFoundError', async () => {
    const repo = makeRepoMock()
    repo.findRoleById = vi.fn().mockResolvedValue(null)
    const { svc } = makeService(repo)

    await expect(svc.deleteRole(toRoleMasterId('missing'))).rejects.toBeInstanceOf(
      MasterNotFoundError,
    )
    expect(repo.deleteRole).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grades (#25: audit log integration)
// ─────────────────────────────────────────────────────────────────────────────

describe('MasterService - grades', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upsertGrade 新規作成時は履歴/監査ログを発行しない', async () => {
    const created = makeGrade()
    const repo = makeRepoMock()
    repo.findGradeById = vi.fn().mockResolvedValue(null)
    repo.upsertGrade = vi.fn().mockResolvedValue(created)
    const { svc, emitter } = makeService(repo)

    const result = await svc.upsertGrade(
      { label: 'G3', performanceWeight: 0.5, goalWeight: 0.3, feedbackWeight: 0.2 },
      ADMIN_USER,
    )

    expect(result).toEqual(created)
    expect(repo.recordGradeWeightHistory).not.toHaveBeenCalled()
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('upsertGrade は既存 grade のウェイト変更時に履歴 + 監査ログを発行する', async () => {
    const before = makeGrade({ performanceWeight: 0.5, goalWeight: 0.3, feedbackWeight: 0.2 })
    const after = makeGrade({ performanceWeight: 0.4, goalWeight: 0.4, feedbackWeight: 0.2 })
    const repo = makeRepoMock()
    repo.findGradeById = vi.fn().mockResolvedValue(before)
    repo.upsertGrade = vi.fn().mockResolvedValue(after)
    const { svc, emitter } = makeService(repo)

    await svc.upsertGrade(
      {
        id: 'grade-1',
        label: 'G3',
        performanceWeight: 0.4,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
      },
      ADMIN_USER,
      { ipAddress: '10.0.0.1', userAgent: 'vitest' },
    )

    expect(repo.recordGradeWeightHistory).toHaveBeenCalledWith({
      gradeId: 'grade-1',
      changedBy: ADMIN_USER,
      beforeJson: {
        label: 'G3',
        performanceWeight: 0.5,
        goalWeight: 0.3,
        feedbackWeight: 0.2,
      },
      afterJson: {
        label: 'G3',
        performanceWeight: 0.4,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
      },
    })

    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_USER,
        action: 'MASTER_DATA_CHANGE',
        resourceType: 'MASTER_DATA',
        resourceId: 'grade-1',
        ipAddress: '10.0.0.1',
        userAgent: 'vitest',
      }),
    )
  })

  it('upsertGrade はウェイトが同一なら履歴を発行しない', async () => {
    const unchanged = makeGrade()
    const repo = makeRepoMock()
    repo.findGradeById = vi.fn().mockResolvedValue(unchanged)
    repo.upsertGrade = vi.fn().mockResolvedValue(unchanged)
    const { svc, emitter } = makeService(repo)

    await svc.upsertGrade(
      {
        id: 'grade-1',
        label: 'G3',
        performanceWeight: 0.5,
        goalWeight: 0.3,
        feedbackWeight: 0.2,
      },
      ADMIN_USER,
    )

    expect(repo.recordGradeWeightHistory).not.toHaveBeenCalled()
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('upsertGrade はウェイト合計が 1 でない場合 GradeWeightSumError', async () => {
    const { svc } = makeService()

    await expect(
      svc.upsertGrade(
        {
          id: 'grade-1',
          label: 'G3',
          performanceWeight: 0.5,
          goalWeight: 0.3,
          feedbackWeight: 0.1,
        },
        ADMIN_USER,
      ),
    ).rejects.toBeInstanceOf(GradeWeightSumError)
  })

  it('deleteGrade は該当 grade がなければ MasterNotFoundError', async () => {
    const repo = makeRepoMock()
    repo.findGradeById = vi.fn().mockResolvedValue(null)
    const { svc } = makeService(repo)

    await expect(svc.deleteGrade(toGradeMasterId('missing'))).rejects.toBeInstanceOf(
      MasterNotFoundError,
    )
    expect(repo.deleteGrade).not.toHaveBeenCalled()
  })
})
