/**
 * Issue #44 / Task 13.3: 目標進捗更新・部下目標一覧 サービス (Req 6.6, 6.7)
 *
 * - recordProgress: GoalProgressHistory に追記
 * - getProgressHistory: 進捗履歴取得
 * - listSubordinateGoals: MANAGER が部下の目標・進捗・承認状態一覧を取得
 */
import { PrismaClient } from '@prisma/client'
import type {
  ProgressUpdate,
  GoalProgressRecord,
  SubordinateGoalSummary,
} from './goal-progress-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface GoalProgressService {
  /** 進捗を記録（GoalProgressHistory に追記） */
  recordProgress(
    goalId: string,
    update: ProgressUpdate,
    recordedBy: string,
  ): Promise<GoalProgressRecord>
  /** 進捗履歴取得 (recordedAt 昇順) */
  getProgressHistory(goalId: string): Promise<GoalProgressRecord[]>
  /**
   * MANAGER が部下の目標・進捗・承認状態一覧を取得。
   * Position テーブルで supervisorPositionId → holderUserId を辿って部下を特定する。
   */
  listSubordinateGoals(managerId: string): Promise<SubordinateGoalSummary[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma delegate shim (型安全アクセス)
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressHistoryRow {
  id: string
  goalId: string
  progressRate: number
  comment: string | null
  recordedBy: string
  recordedAt: Date
}

interface PersonalGoalRow {
  id: string
  userId: string
  title: string
  status: string
  endDate: Date
  progressHistory: Pick<ProgressHistoryRow, 'progressRate' | 'recordedAt'>[]
}

interface PositionRow {
  id: string
  holderUserId: string | null
  supervisorPositionId: string | null
}

interface PrismaDelegates {
  goalProgressHistory: {
    create(args: unknown): Promise<ProgressHistoryRow>
    findMany(args: unknown): Promise<ProgressHistoryRow[]>
  }
  personalGoal: {
    findMany(args: unknown): Promise<PersonalGoalRow[]>
  }
  position: {
    findMany(args: unknown): Promise<PositionRow[]>
  }
}

function asDelegates(db: PrismaClient): PrismaDelegates {
  return db as unknown as PrismaDelegates
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapProgressRow(row: ProgressHistoryRow): GoalProgressRecord {
  return {
    id: row.id,
    goalId: row.goalId,
    progressRate: row.progressRate,
    comment: row.comment,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt,
  }
}

function latestProgressRate(
  history: Pick<ProgressHistoryRow, 'progressRate' | 'recordedAt'>[],
): number {
  if (history.length === 0) return 0
  const sorted = [...history].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
  return sorted.at(0)?.progressRate ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class GoalProgressServiceImpl implements GoalProgressService {
  private readonly delegates: PrismaDelegates

  constructor(db: PrismaClient) {
    this.delegates = asDelegates(db)
  }

  async recordProgress(
    goalId: string,
    update: ProgressUpdate,
    recordedBy: string,
  ): Promise<GoalProgressRecord> {
    const row = await this.delegates.goalProgressHistory.create({
      data: {
        goalId,
        progressRate: update.progressRate,
        comment: update.comment ?? null,
        recordedBy,
      },
    })
    return mapProgressRow(row)
  }

  async getProgressHistory(goalId: string): Promise<GoalProgressRecord[]> {
    const rows = await this.delegates.goalProgressHistory.findMany({
      where: { goalId },
      orderBy: { recordedAt: 'asc' },
    })
    return rows.map(mapProgressRow)
  }

  async listSubordinateGoals(managerId: string): Promise<SubordinateGoalSummary[]> {
    // マネージャーが保有するポジションを取得
    const managerPositions = await this.delegates.position.findMany({
      where: { holderUserId: managerId },
    })
    if (managerPositions.length === 0) return []

    const managerPositionIds = managerPositions.map((p) => p.id)

    // 部下ポジション（supervisorPositionId がマネージャーのポジション）を取得
    const subordinatePositions = await this.delegates.position.findMany({
      where: {
        supervisorPositionId: { in: managerPositionIds },
        holderUserId: { not: null },
      },
    })

    const subordinateUserIds = subordinatePositions
      .map((p) => p.holderUserId)
      .filter((id): id is string => id !== null)

    if (subordinateUserIds.length === 0) return []

    // 部下の目標と最新進捗を取得
    const goals = await this.delegates.personalGoal.findMany({
      where: { userId: { in: subordinateUserIds } },
      include: {
        progressHistory: {
          select: { progressRate: true, recordedAt: true },
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      } as unknown,
    })

    return goals.map((goal) => ({
      userId: goal.userId,
      goalId: goal.id,
      title: goal.title,
      status: goal.status,
      currentProgressRate: latestProgressRate(goal.progressHistory),
      endDate: goal.endDate,
    }))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createGoalProgressService(db?: PrismaClient): GoalProgressService {
  return new GoalProgressServiceImpl(db ?? new PrismaClient())
}
