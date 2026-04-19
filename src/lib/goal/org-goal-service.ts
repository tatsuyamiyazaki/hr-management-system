/**
 * Issue #42 / Task 13.1: 組織目標サービス (Req 6.1, 6.2, 6.10)
 *
 * - 責務:
 *   1. OrgGoal の作成・更新・一覧・ツリー取得
 *   2. 親子ツリー構造の構築 (organization→department→team 階層)
 *   3. OKR / MBO 両形式サポート
 *
 * - design.md の契約:
 *   - createGoal(input): Promise<OrgGoalRecord>
 *   - listGoals(filters?): Promise<OrgGoalRecord[]>
 *   - getGoalTree(rootId?): Promise<OrgGoalTree>
 *   - updateGoal(id, input): Promise<OrgGoalRecord>
 *   - getGoalById(id): Promise<OrgGoalRecord>
 */
import { PrismaClient } from '@prisma/client'
import {
  GoalNotFoundError,
  toOrgGoalId,
  type OrgGoalFilters,
  type OrgGoalInput,
  type OrgGoalRecord,
  type OrgGoalTree,
} from './goal-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgGoalService {
  /** 組織目標を作成する (Req 6.1) */
  createGoal(input: OrgGoalInput): Promise<OrgGoalRecord>

  /** 組織目標の一覧を取得する。フィルタ指定可 (Req 6.2) */
  listGoals(filters?: OrgGoalFilters): Promise<OrgGoalRecord[]>

  /**
   * 親子ツリー構造を返す (Req 6.2, 6.10)。
   * rootId 省略時は parentId=null の最初のルートゴールから構築する。
   * rootId 指定時は指定ゴールをルートとするサブツリーを返す。
   */
  getGoalTree(rootId?: string): Promise<OrgGoalTree>

  /** 組織目標を部分更新する */
  updateGoal(id: string, input: Partial<OrgGoalInput>): Promise<OrgGoalRecord>

  /** 指定 ID の組織目標を取得する */
  getGoalById(id: string): Promise<OrgGoalRecord>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgGoalServiceDeps {
  readonly prisma: PrismaClient
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type PrismaOrgGoal = {
  id: string
  parentId: string | null
  ownerType: 'ORGANIZATION' | 'DEPARTMENT' | 'TEAM'
  ownerId: string
  title: string
  description: string | null
  goalType: 'OKR' | 'MBO'
  keyResult: string | null
  targetValue: number | null
  unit: string | null
  startDate: Date
  endDate: Date
  createdAt: Date
  updatedAt: Date
}

function toRecord(row: PrismaOrgGoal): OrgGoalRecord {
  return {
    id: toOrgGoalId(row.id),
    parentId: row.parentId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    title: row.title,
    description: row.description,
    goalType: row.goalType,
    keyResult: row.keyResult,
    targetValue: row.targetValue,
    unit: row.unit,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * フラットなレコード配列から指定ルート ID のツリーを再帰構築する。
 * 目標数は数百件規模を想定しているため O(n²) は許容範囲。
 */
function buildTree(records: OrgGoalRecord[], rootId: string): OrgGoalTree {
  const root = records.find((r) => r.id === rootId)
  if (!root) {
    throw new GoalNotFoundError('org-goal', rootId)
  }
  const children = records
    .filter((r) => r.parentId === rootId)
    .map((child) => buildTree(records, child.id))
  return { ...root, children }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class OrgGoalServiceImpl implements OrgGoalService {
  private readonly prisma: PrismaClient

  constructor(deps: OrgGoalServiceDeps) {
    this.prisma = deps.prisma
  }

  async createGoal(input: OrgGoalInput): Promise<OrgGoalRecord> {
    const row = await this.prisma.orgGoal.create({
      data: {
        parentId: input.parentId ?? null,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        title: input.title,
        description: input.description ?? null,
        goalType: input.goalType,
        keyResult: input.keyResult ?? null,
        targetValue: input.targetValue ?? null,
        unit: input.unit ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    })
    return toRecord(row)
  }

  async listGoals(filters?: OrgGoalFilters): Promise<OrgGoalRecord[]> {
    const rows = await this.prisma.orgGoal.findMany({
      where: {
        ...(filters?.ownerType !== undefined ? { ownerType: filters.ownerType } : {}),
        ...(filters?.ownerId !== undefined ? { ownerId: filters.ownerId } : {}),
        ...(filters?.goalType !== undefined ? { goalType: filters.goalType } : {}),
      },
      orderBy: [{ ownerType: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map(toRecord)
  }

  async getGoalTree(rootId?: string): Promise<OrgGoalTree> {
    const allRecords = await this.listGoals()

    if (rootId !== undefined) {
      return buildTree(allRecords, rootId)
    }

    // rootId 省略時: parentId=null の最初のルートから構築
    const firstRoot = allRecords.find((r) => r.parentId === null)
    if (!firstRoot) {
      throw new GoalNotFoundError('org-goal', '(root)')
    }
    return buildTree(allRecords, firstRoot.id)
  }

  async updateGoal(id: string, input: Partial<OrgGoalInput>): Promise<OrgGoalRecord> {
    const existing = await this.prisma.orgGoal.findUnique({ where: { id } })
    if (!existing) {
      throw new GoalNotFoundError('org-goal', id)
    }
    const row = await this.prisma.orgGoal.update({
      where: { id },
      data: {
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.ownerType !== undefined ? { ownerType: input.ownerType } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.goalType !== undefined ? { goalType: input.goalType } : {}),
        ...(input.keyResult !== undefined ? { keyResult: input.keyResult } : {}),
        ...(input.targetValue !== undefined ? { targetValue: input.targetValue } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      },
    })
    return toRecord(row)
  }

  async getGoalById(id: string): Promise<OrgGoalRecord> {
    const row = await this.prisma.orgGoal.findUnique({ where: { id } })
    if (!row) {
      throw new GoalNotFoundError('org-goal', id)
    }
    return toRecord(row)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createOrgGoalService(deps: OrgGoalServiceDeps): OrgGoalService {
  return new OrgGoalServiceImpl(deps)
}
