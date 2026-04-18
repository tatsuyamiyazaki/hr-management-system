/**
 * Issue #36 / Task 11.2: SkillService の単体テスト (Req 4.4, 4.5)
 *
 * - registerSkill: 正常登録 / 重複更新 / SkillNotFound(master)
 * - approveSkill: 正常承認 (監査ログ発行) / スキル不在 / 自分自身を承認できない
 * - listMySkills / listPendingApproval / deleteMySkill
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { MasterRepository } from '@/lib/master/master-repository'
import { toSkillMasterId, type SkillMaster } from '@/lib/master/master-types'
import { createSkillService } from '@/lib/skill/skill-service'
import type { SkillRepository } from '@/lib/skill/skill-repository'
import {
  SkillAccessDeniedError,
  SkillNotFoundError,
  toEmployeeSkillId,
  type EmployeeSkill,
  type EmployeeSkillInput,
} from '@/lib/skill/skill-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const EMPLOYEE_ID = 'user-emp-1'
const MANAGER_ID = 'user-mgr-1'
const SKILL_MASTER_ID = 'skill-ts-1'

function makeSkillMaster(overrides: Partial<SkillMaster> = {}): SkillMaster {
  return {
    id: toSkillMasterId(SKILL_MASTER_ID),
    name: 'TypeScript',
    category: 'language',
    description: null,
    deprecated: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeEmployeeSkill(overrides: Partial<EmployeeSkill> = {}): EmployeeSkill {
  return {
    id: toEmployeeSkillId('emp-skill-1'),
    userId: EMPLOYEE_ID,
    skillId: SKILL_MASTER_ID,
    level: 3,
    acquiredAt: new Date('2026-01-15T00:00:00.000Z'),
    approvedByManagerId: null,
    approvedAt: null,
    createdAt: new Date('2026-04-18T09:00:00.000Z'),
    updatedAt: new Date('2026-04-18T09:00:00.000Z'),
    ...overrides,
  }
}

function makeInput(overrides: Partial<EmployeeSkillInput> = {}): EmployeeSkillInput {
  return {
    skillId: SKILL_MASTER_ID,
    level: 3,
    acquiredAt: new Date('2026-01-15T00:00:00.000Z'),
    ...overrides,
  }
}

function makeSkillRepoMock(): SkillRepository {
  return {
    listByUser: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    upsertSkill: vi.fn().mockResolvedValue(makeEmployeeSkill()),
    approveSkill: vi.fn().mockResolvedValue(undefined),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
    listPendingApproval: vi.fn().mockResolvedValue([]),
  }
}

function makeMasterRepoMock(): MasterRepository {
  return {
    listSkills: vi.fn().mockResolvedValue([]),
    findSkillById: vi.fn().mockResolvedValue(makeSkillMaster()),
    upsertSkill: vi.fn().mockResolvedValue(makeSkillMaster()),
    deprecateSkill: vi.fn().mockResolvedValue(undefined),
    listRoles: vi.fn().mockResolvedValue([]),
    findRoleById: vi.fn().mockResolvedValue(null),
    upsertRole: vi.fn().mockResolvedValue({
      id: 'role-1',
      name: 'Engineer',
      gradeId: 'grade-1',
      skillRequirements: [],
    }),
    deleteRole: vi.fn().mockResolvedValue(undefined),
    listGrades: vi.fn().mockResolvedValue([]),
    findGradeById: vi.fn().mockResolvedValue(null),
    upsertGrade: vi.fn().mockResolvedValue({
      id: 'grade-1',
      label: 'G3',
      performanceWeight: 0.5,
      goalWeight: 0.3,
      feedbackWeight: 0.2,
    }),
    deleteGrade: vi.fn().mockResolvedValue(undefined),
    recordGradeWeightHistory: vi.fn().mockResolvedValue(undefined),
  } as unknown as MasterRepository
}

function makeEmitterMock(): AuditLogEmitter {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

function makeService(params?: {
  skillRepo?: SkillRepository
  masterRepo?: MasterRepository
  emitter?: AuditLogEmitter
  now?: Date
}) {
  const skillRepo = params?.skillRepo ?? makeSkillRepoMock()
  const masterRepo = params?.masterRepo ?? makeMasterRepoMock()
  const emitter = params?.emitter ?? makeEmitterMock()
  const now = params?.now ?? new Date('2026-04-18T09:00:00.000Z')
  const svc = createSkillService({
    skillRepo,
    masterRepo,
    auditLogEmitter: emitter,
    clock: () => now,
  })
  return { svc, skillRepo, masterRepo, emitter, now }
}

// ─────────────────────────────────────────────────────────────────────────────
// registerSkill
// ─────────────────────────────────────────────────────────────────────────────

describe('SkillService - registerSkill', () => {
  beforeEach(() => vi.clearAllMocks())

  it('正常登録: SkillMaster が存在する場合 repo.upsertSkill を呼ぶ', async () => {
    const created = makeEmployeeSkill()
    const skillRepo = makeSkillRepoMock()
    skillRepo.upsertSkill = vi.fn().mockResolvedValue(created)
    const masterRepo = makeMasterRepoMock()
    masterRepo.findSkillById = vi.fn().mockResolvedValue(makeSkillMaster())
    const { svc } = makeService({ skillRepo, masterRepo })

    const input = makeInput()
    const result = await svc.registerSkill(EMPLOYEE_ID, input)

    expect(result).toEqual(created)
    expect(masterRepo.findSkillById).toHaveBeenCalledWith(SKILL_MASTER_ID)
    expect(skillRepo.upsertSkill).toHaveBeenCalledWith(EMPLOYEE_ID, input)
  })

  it('重複時は repo.upsertSkill が更新結果を返し、承認状態はリセットされる (repo 側の責務)', async () => {
    const updated = makeEmployeeSkill({ level: 4 })
    const skillRepo = makeSkillRepoMock()
    skillRepo.upsertSkill = vi.fn().mockResolvedValue(updated)
    const { svc } = makeService({ skillRepo })

    const result = await svc.registerSkill(EMPLOYEE_ID, makeInput({ level: 4 }))

    expect(result.level).toBe(4)
    expect(result.approvedAt).toBeNull()
    expect(result.approvedByManagerId).toBeNull()
  })

  it('SkillMaster が存在しない場合 SkillNotFoundError を投げ、upsert は呼ばない', async () => {
    const skillRepo = makeSkillRepoMock()
    const masterRepo = makeMasterRepoMock()
    masterRepo.findSkillById = vi.fn().mockResolvedValue(null)
    const { svc } = makeService({ skillRepo, masterRepo })

    await expect(svc.registerSkill(EMPLOYEE_ID, makeInput())).rejects.toBeInstanceOf(
      SkillNotFoundError,
    )
    expect(skillRepo.upsertSkill).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// approveSkill
// ─────────────────────────────────────────────────────────────────────────────

describe('SkillService - approveSkill', () => {
  beforeEach(() => vi.clearAllMocks())

  it('正常承認: 承認日時を記録し、RECORD_UPDATE 監査ログを発行する', async () => {
    const before = makeEmployeeSkill()
    const skillRepo = makeSkillRepoMock()
    skillRepo.findById = vi.fn().mockResolvedValue(before)
    const emitter = makeEmitterMock()
    const now = new Date('2026-04-18T10:00:00.000Z')
    const { svc } = makeService({ skillRepo, emitter, now })

    await svc.approveSkill(MANAGER_ID, before.id, {
      ipAddress: '10.0.0.1',
      userAgent: 'vitest',
    })

    expect(skillRepo.approveSkill).toHaveBeenCalledWith(before.id, MANAGER_ID, now)
    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MANAGER_ID,
        action: 'RECORD_UPDATE',
        resourceType: 'MASTER_DATA',
        resourceId: before.id,
        ipAddress: '10.0.0.1',
        userAgent: 'vitest',
      }),
    )
    const call = (emitter.emit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      before: Record<string, unknown>
      after: Record<string, unknown>
    }
    expect(call.before.approvedAt).toBeNull()
    expect(call.after.approvedAt).toBe(now.toISOString())
    expect(call.after.approvedByManagerId).toBe(MANAGER_ID)
  })

  it('スキル不在は SkillNotFoundError / approve は呼ばれない', async () => {
    const skillRepo = makeSkillRepoMock()
    skillRepo.findById = vi.fn().mockResolvedValue(null)
    const { svc } = makeService({ skillRepo })

    await expect(svc.approveSkill(MANAGER_ID, toEmployeeSkillId('missing'))).rejects.toBeInstanceOf(
      SkillNotFoundError,
    )
    expect(skillRepo.approveSkill).not.toHaveBeenCalled()
  })

  it('自分自身のスキルは承認できない (SkillAccessDeniedError)', async () => {
    const skill = makeEmployeeSkill({ userId: MANAGER_ID })
    const skillRepo = makeSkillRepoMock()
    skillRepo.findById = vi.fn().mockResolvedValue(skill)
    const emitter = makeEmitterMock()
    const { svc } = makeService({ skillRepo, emitter })

    await expect(svc.approveSkill(MANAGER_ID, skill.id)).rejects.toBeInstanceOf(
      SkillAccessDeniedError,
    )
    expect(skillRepo.approveSkill).not.toHaveBeenCalled()
    expect(emitter.emit).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// listMySkills / listPendingApproval / deleteMySkill
// ─────────────────────────────────────────────────────────────────────────────

describe('SkillService - queries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listMySkills: repo.listByUser に委譲', async () => {
    const skills = [makeEmployeeSkill()]
    const skillRepo = makeSkillRepoMock()
    skillRepo.listByUser = vi.fn().mockResolvedValue(skills)
    const { svc } = makeService({ skillRepo })

    const result = await svc.listMySkills(EMPLOYEE_ID)
    expect(result).toEqual(skills)
    expect(skillRepo.listByUser).toHaveBeenCalledWith(EMPLOYEE_ID)
  })

  it('listPendingApproval: repo.listPendingApproval に委譲', async () => {
    const pending = [makeEmployeeSkill()]
    const skillRepo = makeSkillRepoMock()
    skillRepo.listPendingApproval = vi.fn().mockResolvedValue(pending)
    const { svc } = makeService({ skillRepo })

    const result = await svc.listPendingApproval(MANAGER_ID)
    expect(result).toEqual(pending)
    expect(skillRepo.listPendingApproval).toHaveBeenCalledWith(MANAGER_ID)
  })

  it('deleteMySkill: 他人のスキル削除は SkillAccessDeniedError', async () => {
    const skill = makeEmployeeSkill({ userId: 'someone-else' })
    const skillRepo = makeSkillRepoMock()
    skillRepo.findById = vi.fn().mockResolvedValue(skill)
    const { svc } = makeService({ skillRepo })

    await expect(svc.deleteMySkill(EMPLOYEE_ID, skill.id)).rejects.toBeInstanceOf(
      SkillAccessDeniedError,
    )
    expect(skillRepo.deleteSkill).not.toHaveBeenCalled()
  })

  it('deleteMySkill: 存在しない skill は SkillNotFoundError', async () => {
    const skillRepo = makeSkillRepoMock()
    skillRepo.findById = vi.fn().mockResolvedValue(null)
    const { svc } = makeService({ skillRepo })

    await expect(
      svc.deleteMySkill(EMPLOYEE_ID, toEmployeeSkillId('missing')),
    ).rejects.toBeInstanceOf(SkillNotFoundError)
  })

  it('deleteMySkill: 本人のスキルは repo.deleteSkill を呼ぶ', async () => {
    const skill = makeEmployeeSkill({ userId: EMPLOYEE_ID })
    const skillRepo = makeSkillRepoMock()
    skillRepo.findById = vi.fn().mockResolvedValue(skill)
    const { svc } = makeService({ skillRepo })

    await svc.deleteMySkill(EMPLOYEE_ID, skill.id)
    expect(skillRepo.deleteSkill).toHaveBeenCalledWith(skill.id)
  })
})
