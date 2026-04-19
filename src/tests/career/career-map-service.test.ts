/**
 * Issue #40 / Req 5.1, 5.3, 5.4: CareerMapService の単体テスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCareerMapService } from '@/lib/career/career-map-service'
import type {
  CareerMapRepository,
  EmployeeSkillRow,
  RoleMasterRow,
  RoleSkillRequirementRow,
  SubordinateRow,
} from '@/lib/career/career-map-service'
import type { CareerWish } from '@/lib/career/career-wish-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRole(overrides: Partial<RoleMasterRow> = {}): RoleMasterRow {
  return { id: 'role-1', name: 'Engineer', ...overrides }
}

function makeRequirement(
  overrides: Partial<RoleSkillRequirementRow> = {},
): RoleSkillRequirementRow {
  return {
    roleId: 'role-1',
    skillId: 'skill-ts',
    requiredLevel: 5,
    skillName: 'TypeScript',
    ...overrides,
  }
}

function makeEmployeeSkill(overrides: Partial<EmployeeSkillRow> = {}): EmployeeSkillRow {
  return {
    skillId: 'skill-ts',
    level: 3,
    acquiredAt: new Date('2024-01-01'),
    approvedAt: new Date('2024-01-15'),
    ...overrides,
  }
}

function makeSubordinate(overrides: Partial<SubordinateRow> = {}): SubordinateRow {
  return {
    userId: 'user-sub',
    positionId: 'pos-sub',
    roleId: 'role-1',
    name: 'Taro Yamada',
    ...overrides,
  }
}

function makeCareerWish(overrides: Partial<CareerWish> = {}): CareerWish {
  return {
    id: 'wish-1',
    userId: 'user-sub',
    desiredRoleId: 'role-2',
    desiredRoleName: 'Senior Engineer',
    desiredAt: new Date('2026-01-01'),
    comment: null,
    supersededAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeRepo(overrides: Partial<CareerMapRepository> = {}): CareerMapRepository {
  return {
    listRoles: vi.fn().mockResolvedValue([]),
    listRoleSkillRequirements: vi.fn().mockResolvedValue([]),
    getEmployeeSkills: vi.fn().mockResolvedValue([]),
    getUserPosition: vi.fn().mockResolvedValue(null),
    getActiveCareerWish: vi.fn().mockResolvedValue(null),
    listSubordinates: vi.fn().mockResolvedValue([]),
    getManagerPositionId: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// listRoles
// ─────────────────────────────────────────────────────────────────────────────

describe('CareerMapService.listRoles', () => {
  it('returns empty array when no roles exist', async () => {
    const svc = createCareerMapService(makeRepo())
    const result = await svc.listRoles()
    expect(result).toEqual([])
  })

  it('returns roles with matching skill requirements', async () => {
    const repo = makeRepo({
      listRoles: vi.fn().mockResolvedValue([makeRole()]),
      listRoleSkillRequirements: vi.fn().mockResolvedValue([makeRequirement()]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.listRoles()

    expect(result).toHaveLength(1)
    const role = result[0]!
    expect(role.id).toBe('role-1')
    expect(role.name).toBe('Engineer')
    expect(role.skillRequirements).toHaveLength(1)
    expect(role.skillRequirements[0]).toEqual({
      skillId: 'skill-ts',
      skillName: 'TypeScript',
      requiredLevel: 5,
    })
  })

  it('returns role with empty requirements when no requirements match', async () => {
    const repo = makeRepo({
      listRoles: vi.fn().mockResolvedValue([makeRole({ id: 'role-99' })]),
      listRoleSkillRequirements: vi.fn().mockResolvedValue([makeRequirement({ roleId: 'role-1' })]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.listRoles()

    expect(result[0]!.skillRequirements).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateCareerGap
// ─────────────────────────────────────────────────────────────────────────────

describe('CareerMapService.calculateCareerGap', () => {
  it('calculates gap correctly when actual level 3 and required level 5 → gap = 2', async () => {
    const repo = makeRepo({
      getUserPosition: vi
        .fn()
        .mockResolvedValue({ userId: 'user-1', positionId: 'pos-1', roleId: 'role-1', name: null }),
      getEmployeeSkills: vi.fn().mockResolvedValue([makeEmployeeSkill({ level: 3 })]),
      listRoleSkillRequirements: vi
        .fn()
        .mockResolvedValue([makeRequirement({ roleId: 'role-2', requiredLevel: 5 })]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.calculateCareerGap('user-1', 'role-2')

    expect(result.desiredRoleId).toBe('role-2')
    expect(result.currentRoleId).toBe('role-1')
    expect(result.gaps).toHaveLength(1)
    const gap0 = result.gaps[0]!
    expect(gap0.gap).toBe(2)
    expect(gap0.actualLevel).toBe(3)
    expect(gap0.requiredLevel).toBe(5)
    expect(result.totalGap).toBe(2)
  })

  it('returns zero gap and fulfillmentRate 1.0 when employee meets all requirements', async () => {
    const repo = makeRepo({
      getUserPosition: vi
        .fn()
        .mockResolvedValue({ userId: 'user-1', positionId: 'pos-1', roleId: 'role-1', name: null }),
      getEmployeeSkills: vi.fn().mockResolvedValue([makeEmployeeSkill({ level: 5 })]),
      listRoleSkillRequirements: vi
        .fn()
        .mockResolvedValue([makeRequirement({ roleId: 'role-2', requiredLevel: 5 })]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.calculateCareerGap('user-1', 'role-2')

    expect(result.gaps).toHaveLength(0)
    expect(result.totalGap).toBe(0)
    expect(result.fulfillmentRate).toBe(1)
  })

  it('calculates fulfillmentRate correctly for partial fulfillment (3/5 = 0.6)', async () => {
    const repo = makeRepo({
      getUserPosition: vi.fn().mockResolvedValue(null),
      getEmployeeSkills: vi.fn().mockResolvedValue([makeEmployeeSkill({ level: 3 })]),
      listRoleSkillRequirements: vi
        .fn()
        .mockResolvedValue([makeRequirement({ roleId: 'role-2', requiredLevel: 5 })]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.calculateCareerGap('user-1', 'role-2')

    expect(result.fulfillmentRate).toBeCloseTo(0.6)
    expect(result.currentRoleId).toBeNull()
  })

  it('returns fulfillmentRate 1.0 when desired role has no requirements', async () => {
    const repo = makeRepo({
      getUserPosition: vi.fn().mockResolvedValue(null),
      getEmployeeSkills: vi.fn().mockResolvedValue([makeEmployeeSkill()]),
      listRoleSkillRequirements: vi.fn().mockResolvedValue([]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.calculateCareerGap('user-1', 'role-empty')

    expect(result.fulfillmentRate).toBe(1)
    expect(result.gaps).toHaveLength(0)
    expect(result.totalGap).toBe(0)
  })

  it('calculates totalGap as sum of all individual gaps', async () => {
    const repo = makeRepo({
      getUserPosition: vi.fn().mockResolvedValue(null),
      getEmployeeSkills: vi
        .fn()
        .mockResolvedValue([
          makeEmployeeSkill({ skillId: 'skill-a', level: 1 }),
          makeEmployeeSkill({ skillId: 'skill-b', level: 2 }),
        ]),
      listRoleSkillRequirements: vi.fn().mockResolvedValue([
        makeRequirement({
          roleId: 'role-2',
          skillId: 'skill-a',
          requiredLevel: 4,
          skillName: 'Skill A',
        }),
        makeRequirement({
          roleId: 'role-2',
          skillId: 'skill-b',
          requiredLevel: 5,
          skillName: 'Skill B',
        }),
      ]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.calculateCareerGap('user-1', 'role-2')

    expect(result.totalGap).toBe(6)
    expect(result.gaps).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// listSubordinateWishes
// ─────────────────────────────────────────────────────────────────────────────

describe('CareerMapService.listSubordinateWishes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when manager has no position', async () => {
    const repo = makeRepo({
      getManagerPositionId: vi.fn().mockResolvedValue(null),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.listSubordinateWishes('manager-1')

    expect(result).toEqual([])
  })

  it('returns empty array when manager has no subordinates', async () => {
    const repo = makeRepo({
      getManagerPositionId: vi.fn().mockResolvedValue('pos-mgr'),
      listSubordinates: vi.fn().mockResolvedValue([]),
      listRoleSkillRequirements: vi.fn().mockResolvedValue([]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.listSubordinateWishes('manager-1')

    expect(result).toEqual([])
  })

  it('excludes subordinates without an active career wish', async () => {
    const repo = makeRepo({
      getManagerPositionId: vi.fn().mockResolvedValue('pos-mgr'),
      listSubordinates: vi.fn().mockResolvedValue([makeSubordinate()]),
      listRoleSkillRequirements: vi.fn().mockResolvedValue([]),
      getActiveCareerWish: vi.fn().mockResolvedValue(null),
      getEmployeeSkills: vi.fn().mockResolvedValue([]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.listSubordinateWishes('manager-1')

    expect(result).toHaveLength(0)
  })

  it('returns subordinate wish with fulfillmentRate 1.0 when skills are fully met', async () => {
    const wish = makeCareerWish()
    const repo = makeRepo({
      getManagerPositionId: vi.fn().mockResolvedValue('pos-mgr'),
      listSubordinates: vi.fn().mockResolvedValue([makeSubordinate()]),
      listRoleSkillRequirements: vi
        .fn()
        .mockResolvedValue([makeRequirement({ roleId: 'role-2', requiredLevel: 4 })]),
      getActiveCareerWish: vi.fn().mockResolvedValue(wish),
      getEmployeeSkills: vi.fn().mockResolvedValue([makeEmployeeSkill({ level: 4 })]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.listSubordinateWishes('manager-1')

    expect(result).toHaveLength(1)
    const wish0 = result[0]!
    expect(wish0.userId).toBe('user-sub')
    expect(wish0.userName).toBe('Taro Yamada')
    expect(wish0.desiredRoleId).toBe('role-2')
    expect(wish0.desiredRoleName).toBe('Senior Engineer')
    expect(wish0.fulfillmentRate).toBe(1)
  })

  it('calculates fulfillmentRate for subordinate with partial skills (3/5 = 0.6)', async () => {
    const wish = makeCareerWish()
    const repo = makeRepo({
      getManagerPositionId: vi.fn().mockResolvedValue('pos-mgr'),
      listSubordinates: vi.fn().mockResolvedValue([makeSubordinate()]),
      listRoleSkillRequirements: vi
        .fn()
        .mockResolvedValue([makeRequirement({ roleId: 'role-2', requiredLevel: 5 })]),
      getActiveCareerWish: vi.fn().mockResolvedValue(wish),
      getEmployeeSkills: vi.fn().mockResolvedValue([makeEmployeeSkill({ level: 3 })]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.listSubordinateWishes('manager-1')

    expect(result[0]!.fulfillmentRate).toBeCloseTo(0.6)
  })

  it('returns multiple subordinates who have active wishes', async () => {
    const sub1 = makeSubordinate({ userId: 'user-a', name: 'Alice' })
    const sub2 = makeSubordinate({ userId: 'user-b', name: 'Bob' })
    const wish1 = makeCareerWish({ userId: 'user-a' })
    const wish2 = makeCareerWish({ userId: 'user-b', desiredRoleName: 'Lead' })

    const repo = makeRepo({
      getManagerPositionId: vi.fn().mockResolvedValue('pos-mgr'),
      listSubordinates: vi.fn().mockResolvedValue([sub1, sub2]),
      listRoleSkillRequirements: vi.fn().mockResolvedValue([]),
      getActiveCareerWish: vi.fn().mockResolvedValueOnce(wish1).mockResolvedValueOnce(wish2),
      getEmployeeSkills: vi.fn().mockResolvedValue([]),
    })
    const svc = createCareerMapService(repo)

    const result = await svc.listSubordinateWishes('manager-1')

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.userId)).toContain('user-a')
    expect(result.map((r) => r.userId)).toContain('user-b')
  })
})
