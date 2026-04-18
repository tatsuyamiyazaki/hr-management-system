/**
 * Issue #37 / Req 4.1, 4.2, 4.3: SkillAnalyticsService の単体テスト
 *
 * repo を vi.fn() でモックして以下の振る舞いを検証する:
 * - getOrganizationSummary: 空データ / データあり
 * - getHeatmap: セル集計（部署 × カテゴリ）
 * - getEmployeeRadar: ポイント生成 + 承認状態の反映
 */
import { describe, it, expect, vi } from 'vitest'
import { createSkillAnalyticsService } from '@/lib/skill/skill-analytics-service'
import type {
  EmployeeRow,
  EmployeeSkillRow,
  SkillAnalyticsRepository,
  SkillMasterRow,
} from '@/lib/skill/skill-analytics-service'
import {
  SKILL_LEVEL_MAX,
  UNASSIGNED_DEPARTMENT_NAME,
} from '@/lib/skill/skill-analytics-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeMaster(overrides: Partial<SkillMasterRow> = {}): SkillMasterRow {
  return {
    id: 'skill-ts',
    name: 'TypeScript',
    category: 'language',
    deprecated: false,
    ...overrides,
  }
}

function makeEmployeeSkill(overrides: Partial<EmployeeSkillRow> = {}): EmployeeSkillRow {
  return {
    id: 'es-1',
    userId: 'user-1',
    skillId: 'skill-ts',
    level: 3,
    approved: true,
    ...overrides,
  }
}

function makeEmployee(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    userId: 'user-1',
    departmentId: 'dept-eng',
    departmentName: 'Engineering',
    ...overrides,
  }
}

function makeRepo(overrides: Partial<SkillAnalyticsRepository> = {}): SkillAnalyticsRepository {
  return {
    listEmployeeSkills: vi.fn().mockResolvedValue([]),
    listEmployeeSkillsByUser: vi.fn().mockResolvedValue([]),
    listSkillMasters: vi.fn().mockResolvedValue([]),
    listEmployeesWithDepartment: vi.fn().mockResolvedValue([]),
    countActiveEmployees: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getOrganizationSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('getOrganizationSummary', () => {
  it('空データのとき、totalSkillEntries=0 かつ averageFulfillmentRate=0 を返す', async () => {
    const repo = makeRepo({
      countActiveEmployees: vi.fn().mockResolvedValue(42),
    })
    const svc = createSkillAnalyticsService(repo)

    const summary = await svc.getOrganizationSummary()

    expect(summary.totalEmployees).toBe(42)
    expect(summary.totalSkillEntries).toBe(0)
    expect(summary.averageFulfillmentRate).toBe(0)
    expect(summary.topCategories).toEqual([])
  })

  it('データがあるとき、カテゴリ別の平均充足率と上位カテゴリを返す', async () => {
    const masters: SkillMasterRow[] = [
      makeMaster({ id: 'skill-ts', category: 'language' }),
      makeMaster({ id: 'skill-py', category: 'language' }),
      makeMaster({ id: 'skill-aws', category: 'cloud' }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ id: 'es-1', userId: 'u1', skillId: 'skill-ts', level: 5 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'u2', skillId: 'skill-py', level: 3 }),
      makeEmployeeSkill({ id: 'es-3', userId: 'u3', skillId: 'skill-aws', level: 2 }),
    ]
    const repo = makeRepo({
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
      listSkillMasters: vi.fn().mockResolvedValue(masters),
      countActiveEmployees: vi.fn().mockResolvedValue(3),
    })
    const svc = createSkillAnalyticsService(repo)

    const summary = await svc.getOrganizationSummary()

    expect(summary.totalEmployees).toBe(3)
    expect(summary.totalSkillEntries).toBe(3)
    // normalize(5)=1, normalize(3)=0.6, normalize(2)=0.4 → 平均 0.666...
    expect(summary.averageFulfillmentRate).toBeCloseTo((1 + 0.6 + 0.4) / 3, 5)

    // language は (1 + 0.6) / 2 = 0.8, cloud は 0.4 → language が上位
    expect(summary.topCategories[0]).toEqual({
      category: 'language',
      fulfillmentRate: 0.8,
    })
    expect(summary.topCategories[1]).toEqual({
      category: 'cloud',
      fulfillmentRate: 0.4,
    })
  })

  it('マスタに存在しない skillId はカテゴリ集計から除外する', async () => {
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ id: 'es-1', userId: 'u1', skillId: 'skill-ghost', level: 5 }),
    ]
    const repo = makeRepo({
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
      listSkillMasters: vi.fn().mockResolvedValue([]),
      countActiveEmployees: vi.fn().mockResolvedValue(1),
    })
    const svc = createSkillAnalyticsService(repo)

    const summary = await svc.getOrganizationSummary()

    expect(summary.totalSkillEntries).toBe(1)
    expect(summary.topCategories).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getHeatmap
// ─────────────────────────────────────────────────────────────────────────────

describe('getHeatmap', () => {
  it('部署 × カテゴリでセルを集計する', async () => {
    const masters = [
      makeMaster({ id: 'skill-ts', category: 'language' }),
      makeMaster({ id: 'skill-aws', category: 'cloud' }),
    ]
    const employees = [
      makeEmployee({ userId: 'u1', departmentId: 'dept-eng', departmentName: 'Engineering' }),
      makeEmployee({ userId: 'u2', departmentId: 'dept-eng', departmentName: 'Engineering' }),
      makeEmployee({ userId: 'u3', departmentId: 'dept-sales', departmentName: 'Sales' }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({ id: 'es-1', userId: 'u1', skillId: 'skill-ts', level: 4 }),
      makeEmployeeSkill({ id: 'es-2', userId: 'u2', skillId: 'skill-ts', level: 2 }),
      makeEmployeeSkill({ id: 'es-3', userId: 'u1', skillId: 'skill-aws', level: 3 }),
      makeEmployeeSkill({ id: 'es-4', userId: 'u3', skillId: 'skill-ts', level: 1 }),
    ]
    const repo = makeRepo({
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
      listSkillMasters: vi.fn().mockResolvedValue(masters),
      listEmployeesWithDepartment: vi.fn().mockResolvedValue(employees),
    })
    const svc = createSkillAnalyticsService(repo)

    const heatmap = await svc.getHeatmap()

    expect(heatmap.departments).toEqual(['Engineering', 'Sales'])
    expect(heatmap.categories).toEqual(['cloud', 'language'])

    const engLang = heatmap.cells.find(
      (c) => c.departmentName === 'Engineering' && c.category === 'language',
    )
    expect(engLang).toBeDefined()
    expect(engLang?.averageLevel).toBe(3) // (4 + 2) / 2
    expect(engLang?.employeeCount).toBe(2)

    const engCloud = heatmap.cells.find(
      (c) => c.departmentName === 'Engineering' && c.category === 'cloud',
    )
    expect(engCloud?.averageLevel).toBe(3)
    expect(engCloud?.employeeCount).toBe(1)

    const salesLang = heatmap.cells.find(
      (c) => c.departmentName === 'Sales' && c.category === 'language',
    )
    expect(salesLang?.averageLevel).toBe(1)
    expect(salesLang?.employeeCount).toBe(1)
  })

  it('部署が未所属の社員は UNASSIGNED_DEPARTMENT_NAME で集計される', async () => {
    const masters = [makeMaster({ id: 'skill-ts', category: 'language' })]
    const skills = [
      makeEmployeeSkill({ userId: 'u-orphan', skillId: 'skill-ts', level: 2 }),
    ]
    const repo = makeRepo({
      listEmployeeSkills: vi.fn().mockResolvedValue(skills),
      listSkillMasters: vi.fn().mockResolvedValue(masters),
      listEmployeesWithDepartment: vi.fn().mockResolvedValue([]),
    })
    const svc = createSkillAnalyticsService(repo)

    const heatmap = await svc.getHeatmap()

    expect(heatmap.departments).toEqual([UNASSIGNED_DEPARTMENT_NAME])
    const cell = heatmap.cells[0]
    expect(cell?.departmentName).toBe(UNASSIGNED_DEPARTMENT_NAME)
    expect(cell?.category).toBe('language')
    expect(cell?.averageLevel).toBe(2)
  })

  it('空データのとき、cells/departments/categories は空配列を返す', async () => {
    const svc = createSkillAnalyticsService(makeRepo())
    const heatmap = await svc.getHeatmap()
    expect(heatmap.cells).toEqual([])
    expect(heatmap.departments).toEqual([])
    expect(heatmap.categories).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getEmployeeRadar
// ─────────────────────────────────────────────────────────────────────────────

describe('getEmployeeRadar', () => {
  it('社員のスキルからレーダーポイントを生成し、maxLevel=5 固定で返す', async () => {
    const masters = [
      makeMaster({ id: 'skill-ts', name: 'TypeScript', category: 'language' }),
      makeMaster({ id: 'skill-aws', name: 'AWS', category: 'cloud' }),
    ]
    const skills: EmployeeSkillRow[] = [
      makeEmployeeSkill({
        id: 'es-1',
        userId: 'user-1',
        skillId: 'skill-ts',
        level: 4,
        approved: true,
      }),
      makeEmployeeSkill({
        id: 'es-2',
        userId: 'user-1',
        skillId: 'skill-aws',
        level: 2,
        approved: false,
      }),
    ]
    const repo = makeRepo({
      listEmployeeSkillsByUser: vi.fn().mockResolvedValue(skills),
      listSkillMasters: vi.fn().mockResolvedValue(masters),
    })
    const svc = createSkillAnalyticsService(repo)

    const radar = await svc.getEmployeeRadar('user-1')

    expect(radar.userId).toBe('user-1')
    expect(radar.points).toHaveLength(2)
    // sorted by category asc (cloud < language)
    expect(radar.points[0]).toEqual({
      skillName: 'AWS',
      category: 'cloud',
      currentLevel: 2,
      maxLevel: SKILL_LEVEL_MAX,
      approved: false,
    })
    expect(radar.points[1]).toEqual({
      skillName: 'TypeScript',
      category: 'language',
      currentLevel: 4,
      maxLevel: SKILL_LEVEL_MAX,
      approved: true,
    })
    expect(repo.listEmployeeSkillsByUser).toHaveBeenCalledWith('user-1')
  })

  it('廃止済み (deprecated) のスキルマスタに紐づく取得記録は除外する', async () => {
    const masters = [
      makeMaster({ id: 'skill-old', name: 'OldLang', category: 'language', deprecated: true }),
    ]
    const skills = [
      makeEmployeeSkill({ userId: 'user-1', skillId: 'skill-old', level: 5, approved: true }),
    ]
    const repo = makeRepo({
      listEmployeeSkillsByUser: vi.fn().mockResolvedValue(skills),
      listSkillMasters: vi.fn().mockResolvedValue(masters),
    })
    const svc = createSkillAnalyticsService(repo)

    const radar = await svc.getEmployeeRadar('user-1')

    expect(radar.points).toEqual([])
  })

  it('スキルを持たない社員は空のポイント配列を返す', async () => {
    const svc = createSkillAnalyticsService(makeRepo())
    const radar = await svc.getEmployeeRadar('user-x')
    expect(radar.userId).toBe('user-x')
    expect(radar.points).toEqual([])
  })
})
