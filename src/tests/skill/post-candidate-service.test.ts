/**
 * Issue #38 / Req 4.6, 4.7, 4.8: PostCandidateService の単体テスト
 *
 * - listCandidatesForPost: 候補者一覧とスキル充足率
 * - listUnderstaffedPosts: 閾値未満ポストのアラート
 * - getSkillGapRanking: スキルギャップランキング
 */
import { describe, it, expect, vi } from 'vitest'
import { createPostCandidateService } from '@/lib/skill/post-candidate-service'
import type {
  PostCandidateRepository,
  PositionRow,
  RoleSkillRequirementRow,
  EmployeeSkillRow,
} from '@/lib/skill/post-candidate-service'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makePosition(overrides: Partial<PositionRow> = {}): PositionRow {
  return {
    id: 'pos-1',
    roleId: 'role-engineer',
    roleName: 'Engineer',
    holderUserId: null,
    ...overrides,
  }
}

function makeRequirement(
  overrides: Partial<RoleSkillRequirementRow> = {},
): RoleSkillRequirementRow {
  return {
    id: 'req-1',
    roleId: 'role-engineer',
    skillId: 'skill-ts',
    requiredLevel: 3,
    skillName: 'TypeScript',
    ...overrides,
  }
}

function makeEmployeeSkill(overrides: Partial<EmployeeSkillRow> = {}): EmployeeSkillRow {
  return {
    id: 'es-1',
    userId: 'user-1',
    skillId: 'skill-ts',
    level: 4,
    approved: true,
    ...overrides,
  }
}

function makeRepo(overrides: Partial<PostCandidateRepository> = {}): PostCandidateRepository {
  return {
    listPositions: vi.fn().mockResolvedValue([]),
    listPositionById: vi.fn().mockResolvedValue(null),
    listRoleSkillRequirements: vi.fn().mockResolvedValue([]),
    listEmployeeSkills: vi.fn().mockResolvedValue([]),
    listActiveUserIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// listCandidatesForPost
// ─────────────────────────────────────────────────────────────────────────────

describe('listCandidatesForPost', () => {
  it('ポジションが存在しない場合はエラーをスローする', async () => {
    const repo = makeRepo({
      listPositionById: vi.fn().mockResolvedValue(null),
    })
    const svc = createPostCandidateService(repo)

    await expect(svc.listCandidatesForPost('pos-unknown')).rejects.toThrow('Position not found')
  })

  it('スキル要件がない場合、候補者は充足率1.0で返る', async () => {
    const repo = makeRepo({
      listPositionById: vi.fn().mockResolvedValue(makePosition()),
      listRoleSkillRequirements: vi.fn().mockResolvedValue([]),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-1', 'user-2']),
      listEmployeeSkills: vi.fn().mockResolvedValue([]),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.listCandidatesForPost('pos-1')

    expect(result.positionId).toBe('pos-1')
    expect(result.roleId).toBe('role-engineer')
    expect(result.roleName).toBe('Engineer')
    expect(result.fulfillmentRate).toBe(1.0)
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]?.fulfillmentRate).toBe(1.0)
    expect(result.candidates[0]?.matchedSkills).toBe(0)
    expect(result.candidates[0]?.totalRequired).toBe(0)
  })

  it('候補者スキルが要件を一部満たす場合、充足スキル数が正しく計算される', async () => {
    const position = makePosition()
    const requirements = [
      makeRequirement({ skillId: 'skill-ts', requiredLevel: 3 }),
      makeRequirement({ id: 'req-2', skillId: 'skill-py', requiredLevel: 2, skillName: 'Python' }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ userId: 'user-1', skillId: 'skill-ts', level: 4 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'user-1', skillId: 'skill-py', level: 1 }),
    ]
    const repo = makeRepo({
      listPositionById: vi.fn().mockResolvedValue(position),
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-1']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.listCandidatesForPost('pos-1')

    const candidate = result.candidates.find((c) => c.userId === 'user-1')
    expect(candidate).toBeDefined()
    expect(candidate?.totalRequired).toBe(2)
    expect(candidate?.matchedSkills).toBe(1) // skill-ts 満たす、skill-py 不足
    expect(candidate?.fulfillmentRate).toBeCloseTo(0.5, 5)
  })

  it('候補者が全スキル要件を満たす場合、充足率は1.0になる', async () => {
    const position = makePosition()
    const requirements = [makeRequirement({ skillId: 'skill-ts', requiredLevel: 3 })]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ userId: 'user-1', skillId: 'skill-ts', level: 5 }),
    ]
    const repo = makeRepo({
      listPositionById: vi.fn().mockResolvedValue(position),
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-1']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.listCandidatesForPost('pos-1')

    expect(result.candidates[0]?.fulfillmentRate).toBe(1.0)
    expect(result.candidates[0]?.matchedSkills).toBe(1)
  })

  it('候補者が複数いる場合、充足率の降順でソートされる', async () => {
    const position = makePosition()
    const requirements = [makeRequirement({ skillId: 'skill-ts', requiredLevel: 3 })]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ id: 'es-1', userId: 'user-a', skillId: 'skill-ts', level: 1 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'user-b', skillId: 'skill-ts', level: 4 }),
    ]
    const repo = makeRepo({
      listPositionById: vi.fn().mockResolvedValue(position),
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a', 'user-b']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.listCandidatesForPost('pos-1')

    expect(result.candidates[0]?.userId).toBe('user-b')
    expect(result.candidates[1]?.userId).toBe('user-a')
  })

  it('ポジションのfulfillmentRateは全候補者の平均となる', async () => {
    const position = makePosition()
    const requirements = [makeRequirement({ skillId: 'skill-ts', requiredLevel: 3 })]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ id: 'es-1', userId: 'user-a', skillId: 'skill-ts', level: 4 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'user-b', skillId: 'skill-ts', level: 1 }),
    ]
    const repo = makeRepo({
      listPositionById: vi.fn().mockResolvedValue(position),
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a', 'user-b']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.listCandidatesForPost('pos-1')

    // user-a: 充足率 1.0, user-b: 充足率 0.0 → 平均 0.5
    expect(result.fulfillmentRate).toBeCloseTo(0.5, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// listUnderstaffedPosts
// ─────────────────────────────────────────────────────────────────────────────

describe('listUnderstaffedPosts', () => {
  it('空のポジションリストの場合、空配列を返す', async () => {
    const repo = makeRepo({ listPositions: vi.fn().mockResolvedValue([]) })
    const svc = createPostCandidateService(repo)

    const result = await svc.listUnderstaffedPosts()

    expect(result).toEqual([])
  })

  it('デフォルト閾値(0.6)未満のポストのみ返す', async () => {
    const positions = [
      makePosition({ id: 'pos-1', roleId: 'role-eng', roleName: 'Engineer' }),
      makePosition({ id: 'pos-2', roleId: 'role-eng', roleName: 'Engineer' }),
    ]
    const requirements = [
      makeRequirement({ roleId: 'role-eng', skillId: 'skill-ts', requiredLevel: 3 }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ userId: 'user-a', skillId: 'skill-ts', level: 4 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'user-b', skillId: 'skill-ts', level: 1 }),
    ]
    const repo = makeRepo({
      listPositions: vi.fn().mockResolvedValue(positions),
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a', 'user-b']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.listUnderstaffedPosts()

    // user-a: 充足率1.0, user-b: 充足率0.0 → 平均0.5 < 0.6 → アラート対象
    expect(result).toHaveLength(2)
    expect(result[0]?.positionId).toBeDefined()
  })

  it('全ポストが閾値以上の場合、空配列を返す', async () => {
    const positions = [makePosition({ id: 'pos-1', roleId: 'role-eng', roleName: 'Engineer' })]
    const requirements = [
      makeRequirement({ roleId: 'role-eng', skillId: 'skill-ts', requiredLevel: 3 }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ userId: 'user-a', skillId: 'skill-ts', level: 4 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'user-b', skillId: 'skill-ts', level: 3 }),
    ]
    const repo = makeRepo({
      listPositions: vi.fn().mockResolvedValue(positions),
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a', 'user-b']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.listUnderstaffedPosts()

    expect(result).toHaveLength(0)
  })

  it('カスタム閾値を指定できる', async () => {
    const positions = [makePosition({ id: 'pos-1', roleId: 'role-eng', roleName: 'Engineer' })]
    const requirements = [
      makeRequirement({ roleId: 'role-eng', skillId: 'skill-ts', requiredLevel: 3 }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ userId: 'user-a', skillId: 'skill-ts', level: 4 }),
    ]
    const repo = makeRepo({
      listPositions: vi.fn().mockResolvedValue(positions),
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    // user-a は充足率1.0 → 閾値1.1未満 → アラート対象
    const result = await svc.listUnderstaffedPosts(1.1)
    expect(result).toHaveLength(1)

    // 閾値0.5以下は対象外
    const result2 = await svc.listUnderstaffedPosts(0.5)
    expect(result2).toHaveLength(0)
  })

  it('返却するアラート情報には positionId, roleId, roleName, fulfillmentRate が含まれる', async () => {
    const positions = [makePosition({ id: 'pos-1', roleId: 'role-eng', roleName: 'Engineer' })]
    const requirements = [
      makeRequirement({ roleId: 'role-eng', skillId: 'skill-ts', requiredLevel: 3 }),
    ]
    const repo = makeRepo({
      listPositions: vi.fn().mockResolvedValue(positions),
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue([]),
      listEmployeeSkills: vi.fn().mockResolvedValue([]),
    })
    const svc = createPostCandidateService(repo)

    // 候補者なし → 充足率0.0 → 閾値0.6未満
    const result = await svc.listUnderstaffedPosts(0.6)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      positionId: 'pos-1',
      roleId: 'role-eng',
      roleName: 'Engineer',
      fulfillmentRate: expect.any(Number),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getSkillGapRanking
// ─────────────────────────────────────────────────────────────────────────────

describe('getSkillGapRanking', () => {
  it('スキル要件もスキルも存在しない場合、空配列を返す', async () => {
    const svc = createPostCandidateService(makeRepo())
    const result = await svc.getSkillGapRanking()
    expect(result).toEqual([])
  })

  it('要件あり・保有スキルなしの場合、全員がギャップを持つ', async () => {
    const requirements = [
      makeRequirement({ skillId: 'skill-ts', skillName: 'TypeScript', requiredLevel: 3 }),
    ]
    const repo = makeRepo({
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a', 'user-b']),
      listEmployeeSkills: vi.fn().mockResolvedValue([]),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.getSkillGapRanking()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      skillId: 'skill-ts',
      skillName: 'TypeScript',
      averageGap: 3, // 要件3 - 実際0 = 3
      affectedEmployeeCount: 2,
    })
  })

  it('スキルが要件を満たす場合、ギャップは0でランキングから除外される', async () => {
    const requirements = [
      makeRequirement({ skillId: 'skill-ts', skillName: 'TypeScript', requiredLevel: 3 }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ userId: 'user-a', skillId: 'skill-ts', level: 4 }),
    ]
    const repo = makeRepo({
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.getSkillGapRanking()

    expect(result).toHaveLength(0)
  })

  it('複数スキルのギャップが平均不足レベルの降順でソートされる', async () => {
    const requirements = [
      makeRequirement({
        id: 'req-ts',
        skillId: 'skill-ts',
        skillName: 'TypeScript',
        requiredLevel: 5,
      }),
      makeRequirement({ id: 'req-py', skillId: 'skill-py', skillName: 'Python', requiredLevel: 3 }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ id: 'es-1', userId: 'user-a', skillId: 'skill-ts', level: 2 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'user-a', skillId: 'skill-py', level: 1 }),
    ]
    const repo = makeRepo({
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.getSkillGapRanking()

    // TypeScript: gap = 5 - 2 = 3, Python: gap = 3 - 1 = 2 → TS が上位
    expect(result).toHaveLength(2)
    expect(result[0]?.skillId).toBe('skill-ts')
    expect(result[0]?.averageGap).toBeCloseTo(3, 5)
    expect(result[1]?.skillId).toBe('skill-py')
    expect(result[1]?.averageGap).toBeCloseTo(2, 5)
  })

  it('複数のロールで同じスキルが要求される場合、最大要求レベルで計算する', async () => {
    const requirements = [
      makeRequirement({
        id: 'req-1',
        roleId: 'role-a',
        skillId: 'skill-ts',
        skillName: 'TypeScript',
        requiredLevel: 3,
      }),
      makeRequirement({
        id: 'req-2',
        roleId: 'role-b',
        skillId: 'skill-ts',
        skillName: 'TypeScript',
        requiredLevel: 5,
      }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ userId: 'user-a', skillId: 'skill-ts', level: 2 }),
    ]
    const repo = makeRepo({
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.getSkillGapRanking()

    expect(result).toHaveLength(1)
    // 最大要求レベル5, 実際2 → gap = 3
    expect(result[0]?.averageGap).toBeCloseTo(3, 5)
  })

  it('affectedEmployeeCount はギャップを持つ社員数のみカウントする', async () => {
    const requirements = [
      makeRequirement({ skillId: 'skill-ts', skillName: 'TypeScript', requiredLevel: 3 }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ id: 'es-1', userId: 'user-a', skillId: 'skill-ts', level: 4 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'user-b', skillId: 'skill-ts', level: 1 }),
    ]
    const repo = makeRepo({
      listRoleSkillRequirements: vi.fn().mockResolvedValue(requirements),
      listActiveUserIds: vi.fn().mockResolvedValue(['user-a', 'user-b']),
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
    })
    const svc = createPostCandidateService(repo)

    const result = await svc.getSkillGapRanking()

    expect(result).toHaveLength(1)
    // user-a は充足 (4 >= 3)、user-b は不足 (1 < 3)
    expect(result[0]?.affectedEmployeeCount).toBe(1)
    expect(result[0]?.averageGap).toBeCloseTo(2, 5) // (3 - 1) / 1
  })
})
