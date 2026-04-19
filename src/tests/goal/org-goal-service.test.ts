/**
 * Issue #42 / Task 13.1: OrgGoalService の単体テスト (Req 6.1, 6.2, 6.10)
 *
 * - createGoal: OKR/MBO 両形式での作成
 * - listGoals: フィルタリング（ownerType / ownerId）
 * - getGoalTree: 親子ツリー構造（organization→department→team 階層）
 * - updateGoal: 部分更新 / 存在しない場合の GoalNotFoundError
 * - getGoalById: 存在する / しない場合
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOrgGoalService } from '@/lib/goal/org-goal-service'
import {
  GoalNotFoundError,
  toOrgGoalId,
  type OrgGoalInput,
  type OrgGoalRecord,
} from '@/lib/goal/goal-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-19T00:00:00.000Z')
const START = new Date('2026-01-01T00:00:00.000Z')
const END = new Date('2026-03-31T00:00:00.000Z')

function makeOkrInput(overrides: Partial<OrgGoalInput> = {}): OrgGoalInput {
  return {
    ownerType: 'ORGANIZATION',
    ownerId: 'org-001',
    title: '全社売上目標',
    goalType: 'OKR',
    keyResult: '売上 +20%',
    targetValue: 120,
    unit: '%',
    startDate: START,
    endDate: END,
    ...overrides,
  }
}

function makeMboInput(overrides: Partial<OrgGoalInput> = {}): OrgGoalInput {
  return {
    ownerType: 'DEPARTMENT',
    ownerId: 'dept-001',
    title: '営業部門目標',
    goalType: 'MBO',
    startDate: START,
    endDate: END,
    ...overrides,
  }
}

function makeRecord(overrides: Partial<OrgGoalRecord> = {}): OrgGoalRecord {
  return {
    id: toOrgGoalId('goal-org-1'),
    parentId: null,
    ownerType: 'ORGANIZATION',
    ownerId: 'org-001',
    title: '全社売上目標',
    description: null,
    goalType: 'OKR',
    keyResult: '売上 +20%',
    targetValue: 120,
    unit: '%',
    startDate: START,
    endDate: END,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma mock factory
// ─────────────────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    orgGoal: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      ...overrides,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createGoal
// ─────────────────────────────────────────────────────────────────────────────

describe('OrgGoalService - createGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('OKR 形式で目標を作成できる', async () => {
    const expected = makeRecord()
    const prisma = makePrisma({ create: vi.fn().mockResolvedValue(expected) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const result = await svc.createGoal(makeOkrInput())

    expect(result.goalType).toBe('OKR')
    expect(result.keyResult).toBe('売上 +20%')
    expect(result.targetValue).toBe(120)
    expect(prisma.orgGoal.create).toHaveBeenCalledOnce()
  })

  it('MBO 形式で目標を作成できる', async () => {
    const expected = makeRecord({
      id: toOrgGoalId('goal-dept-1'),
      ownerType: 'DEPARTMENT',
      ownerId: 'dept-001',
      title: '営業部門目標',
      goalType: 'MBO',
      keyResult: null,
      targetValue: null,
      unit: null,
    })
    const prisma = makePrisma({ create: vi.fn().mockResolvedValue(expected) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const result = await svc.createGoal(makeMboInput())

    expect(result.goalType).toBe('MBO')
    expect(result.keyResult).toBeNull()
    expect(result.ownerType).toBe('DEPARTMENT')
  })

  it('parentId を指定して子ゴールを作成できる', async () => {
    const expected = makeRecord({
      id: toOrgGoalId('goal-dept-1'),
      parentId: 'goal-org-1',
      ownerType: 'DEPARTMENT',
      ownerId: 'dept-001',
    })
    const prisma = makePrisma({ create: vi.fn().mockResolvedValue(expected) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const result = await svc.createGoal(
      makeMboInput({ parentId: 'goal-org-1', ownerType: 'DEPARTMENT' }),
    )

    expect(result.parentId).toBe('goal-org-1')
    const callArg = (prisma.orgGoal.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(callArg.data.parentId).toBe('goal-org-1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// listGoals
// ─────────────────────────────────────────────────────────────────────────────

describe('OrgGoalService - listGoals', () => {
  beforeEach(() => vi.clearAllMocks())

  it('フィルタなしで全件返す', async () => {
    const records = [makeRecord(), makeRecord({ id: toOrgGoalId('goal-2') })]
    const prisma = makePrisma({ findMany: vi.fn().mockResolvedValue(records) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const result = await svc.listGoals()

    expect(result).toHaveLength(2)
    expect(prisma.orgGoal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
  })

  it('ownerType フィルタを where 句に渡す', async () => {
    const prisma = makePrisma({ findMany: vi.fn().mockResolvedValue([]) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    await svc.listGoals({ ownerType: 'DEPARTMENT' })

    const callArg = (prisma.orgGoal.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(callArg.where.ownerType).toBe('DEPARTMENT')
  })

  it('ownerId フィルタを where 句に渡す', async () => {
    const prisma = makePrisma({ findMany: vi.fn().mockResolvedValue([]) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    await svc.listGoals({ ownerId: 'dept-001' })

    const callArg = (prisma.orgGoal.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(callArg.where.ownerId).toBe('dept-001')
  })

  it('goalType フィルタを where 句に渡す', async () => {
    const prisma = makePrisma({ findMany: vi.fn().mockResolvedValue([]) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    await svc.listGoals({ goalType: 'OKR' })

    const callArg = (prisma.orgGoal.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(callArg.where.goalType).toBe('OKR')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getGoalTree
// ─────────────────────────────────────────────────────────────────────────────

describe('OrgGoalService - getGoalTree', () => {
  beforeEach(() => vi.clearAllMocks())

  it('organization→department の 2 階層ツリーを構築できる', async () => {
    const orgGoal = makeRecord({
      id: toOrgGoalId('goal-org-1'),
      parentId: null,
      ownerType: 'ORGANIZATION',
    })
    const deptGoal = makeRecord({
      id: toOrgGoalId('goal-dept-1'),
      parentId: 'goal-org-1',
      ownerType: 'DEPARTMENT',
      ownerId: 'dept-001',
    })
    const prisma = makePrisma({
      findMany: vi.fn().mockResolvedValue([orgGoal, deptGoal]),
    })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const tree = await svc.getGoalTree('goal-org-1')

    expect(tree.id).toBe('goal-org-1')
    expect(tree.ownerType).toBe('ORGANIZATION')
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]?.id).toBe('goal-dept-1')
    expect(tree.children[0]?.ownerType).toBe('DEPARTMENT')
    expect(tree.children[0]?.children).toHaveLength(0)
  })

  it('organization→department→team の 3 階層ツリーを構築できる', async () => {
    const orgGoal = makeRecord({
      id: toOrgGoalId('goal-org-1'),
      parentId: null,
      ownerType: 'ORGANIZATION',
    })
    const deptGoal = makeRecord({
      id: toOrgGoalId('goal-dept-1'),
      parentId: 'goal-org-1',
      ownerType: 'DEPARTMENT',
    })
    const teamGoal = makeRecord({
      id: toOrgGoalId('goal-team-1'),
      parentId: 'goal-dept-1',
      ownerType: 'TEAM',
    })
    const prisma = makePrisma({
      findMany: vi.fn().mockResolvedValue([orgGoal, deptGoal, teamGoal]),
    })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const tree = await svc.getGoalTree('goal-org-1')

    expect(tree.children[0]?.children[0]?.id).toBe('goal-team-1')
    expect(tree.children[0]?.children[0]?.ownerType).toBe('TEAM')
  })

  it('存在しない rootId は GoalNotFoundError を投げる', async () => {
    const orgGoal = makeRecord({ id: toOrgGoalId('goal-org-1'), parentId: null })
    const prisma = makePrisma({ findMany: vi.fn().mockResolvedValue([orgGoal]) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    await expect(svc.getGoalTree('nonexistent-id')).rejects.toBeInstanceOf(GoalNotFoundError)
  })

  it('rootId 省略時はデータが空なら GoalNotFoundError を投げる', async () => {
    const prisma = makePrisma({ findMany: vi.fn().mockResolvedValue([]) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    await expect(svc.getGoalTree()).rejects.toBeInstanceOf(GoalNotFoundError)
  })

  it('rootId 省略時は parentId=null の最初のゴールをルートにする', async () => {
    const orgGoal = makeRecord({ id: toOrgGoalId('goal-org-1'), parentId: null })
    const prisma = makePrisma({ findMany: vi.fn().mockResolvedValue([orgGoal]) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const tree = await svc.getGoalTree()

    expect(tree.id).toBe('goal-org-1')
    expect(tree.children).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// updateGoal
// ─────────────────────────────────────────────────────────────────────────────

describe('OrgGoalService - updateGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('存在する目標を部分更新できる', async () => {
    const existing = makeRecord()
    const updated = makeRecord({ title: '更新後タイトル' })
    const prisma = makePrisma({
      findUnique: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue(updated),
    })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const result = await svc.updateGoal('goal-org-1', { title: '更新後タイトル' })

    expect(result.title).toBe('更新後タイトル')
    expect(prisma.orgGoal.update).toHaveBeenCalledOnce()
  })

  it('存在しない目標の更新は GoalNotFoundError を投げる', async () => {
    const prisma = makePrisma({ findUnique: vi.fn().mockResolvedValue(null) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    await expect(svc.updateGoal('nonexistent', { title: '更新' })).rejects.toBeInstanceOf(
      GoalNotFoundError,
    )
    expect(prisma.orgGoal.update).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getGoalById
// ─────────────────────────────────────────────────────────────────────────────

describe('OrgGoalService - getGoalById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('存在する ID のレコードを返す', async () => {
    const record = makeRecord()
    const prisma = makePrisma({ findUnique: vi.fn().mockResolvedValue(record) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    const result = await svc.getGoalById('goal-org-1')

    expect(result.id).toBe('goal-org-1')
    expect(prisma.orgGoal.findUnique).toHaveBeenCalledWith({ where: { id: 'goal-org-1' } })
  })

  it('存在しない ID は GoalNotFoundError を投げる', async () => {
    const prisma = makePrisma({ findUnique: vi.fn().mockResolvedValue(null) })
    const svc = createOrgGoalService({ prisma: prisma as never })

    await expect(svc.getGoalById('nonexistent')).rejects.toBeInstanceOf(GoalNotFoundError)
  })
})
