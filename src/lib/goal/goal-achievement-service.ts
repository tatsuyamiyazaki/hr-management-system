/**
 * Issue #46 / Task 13.5: 評価サイクルとの目標達成率連携 — サービス (Req 6.9)
 *
 * - createCycle: 評価サイクルを作成
 * - linkGoalsToCycle: 評価期間内の PersonalGoal をスナップショット保存
 * - getAchievementSummary: ユーザーごとの達成率サマリを取得
 * - listCycleAchievements: サイクル全体のサマリ一覧（HR_MANAGER 向け）
 */
import type { PrismaClient } from '@prisma/client'
import type {
  EvaluationCycleInput,
  EvaluationCycleRecord,
  GoalAchievementRecord,
  GoalAchievementSummary,
} from './goal-achievement-types'
import { EvaluationCycleNotFoundError } from './goal-achievement-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface GoalAchievementService {
  /** 評価サイクルを作成 */
  createCycle(input: EvaluationCycleInput): Promise<EvaluationCycleRecord>
  /**
   * 評価期間終了時に PersonalGoal の達成状況をスナップショット保存。
   * cycleId の startDate〜endDate に endDate が含まれる PersonalGoal を対象とする。
   */
  linkGoalsToCycle(cycleId: string): Promise<{ linked: number }>
  /** ユーザーごとの達成率サマリを取得 */
  getAchievementSummary(cycleId: string, userId: string): Promise<GoalAchievementSummary>
  /** 評価サイクル全体のサマリ一覧（HR_MANAGER 向け） */
  listCycleAchievements(cycleId: string): Promise<GoalAchievementSummary[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row types (型安全アクセス用)
// ─────────────────────────────────────────────────────────────────────────────

interface EvaluationCycleRow {
  id: string
  name: string
  startDate: Date
  endDate: Date
  createdAt: Date
}

interface GoalAchievementRow {
  id: string
  cycleId: string
  goalId: string
  userId: string
  finalProgress: number
  isCompleted: boolean
  achievementNote: string | null
  linkedAt: Date
}

interface PersonalGoalRow {
  id: string
  userId: string
  status: string
  endDate: Date
  progressHistory: Array<{ progressRate: number; recordedAt: Date }>
}

interface PrismaDelegates {
  evaluationCycle: {
    create(args: unknown): Promise<EvaluationCycleRow>
    findUnique(args: unknown): Promise<EvaluationCycleRow | null>
  }
  goalAchievement: {
    upsert(args: unknown): Promise<GoalAchievementRow>
    findMany(args: unknown): Promise<GoalAchievementRow[]>
  }
  personalGoal: {
    findMany(args: unknown): Promise<PersonalGoalRow[]>
  }
}

function asDelegates(db: PrismaClient): PrismaDelegates {
  return db as unknown as PrismaDelegates
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

function toCycleRecord(row: EvaluationCycleRow): EvaluationCycleRecord {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
  }
}

function toAchievementRecord(row: GoalAchievementRow): GoalAchievementRecord {
  return {
    id: row.id,
    cycleId: row.cycleId,
    goalId: row.goalId,
    userId: row.userId,
    finalProgress: row.finalProgress,
    isCompleted: row.isCompleted,
    achievementNote: row.achievementNote,
    linkedAt: row.linkedAt,
  }
}

function latestProgressRate(history: Array<{ progressRate: number; recordedAt: Date }>): number {
  if (history.length === 0) return 0
  const sorted = [...history].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
  return sorted[0]?.progressRate ?? 0
}

function buildSummary(userId: string, records: GoalAchievementRecord[]): GoalAchievementSummary {
  const totalGoals = records.length
  const completedGoals = records.filter((r) => r.isCompleted).length
  const averageProgress =
    totalGoals === 0
      ? 0
      : Math.round(records.reduce((sum, r) => sum + r.finalProgress, 0) / totalGoals)
  return { userId, totalGoals, completedGoals, averageProgress, achievements: records }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class GoalAchievementServiceImpl implements GoalAchievementService {
  private readonly delegates: PrismaDelegates

  constructor(db: PrismaClient) {
    this.delegates = asDelegates(db)
  }

  async createCycle(input: EvaluationCycleInput): Promise<EvaluationCycleRecord> {
    const row = await this.delegates.evaluationCycle.create({
      data: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    })
    return toCycleRecord(row)
  }

  async linkGoalsToCycle(cycleId: string): Promise<{ linked: number }> {
    const cycle = await this.delegates.evaluationCycle.findUnique({ where: { id: cycleId } })
    if (!cycle) throw new EvaluationCycleNotFoundError(cycleId)

    // 評価期間内に endDate が含まれる PersonalGoal を取得
    const goals = await this.delegates.personalGoal.findMany({
      where: {
        endDate: {
          gte: cycle.startDate,
          lte: cycle.endDate,
        },
      },
      include: {
        progressHistory: {
          select: { progressRate: true, recordedAt: true },
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      } as unknown,
    })

    let linked = 0
    for (const goal of goals) {
      const finalProgress = latestProgressRate(goal.progressHistory)
      const isCompleted = goal.status === 'COMPLETED'

      await this.delegates.goalAchievement.upsert({
        where: { cycleId_goalId: { cycleId, goalId: goal.id } },
        create: {
          cycleId,
          goalId: goal.id,
          userId: goal.userId,
          finalProgress,
          isCompleted,
          achievementNote: null,
        },
        update: {
          finalProgress,
          isCompleted,
        },
      })
      linked++
    }

    return { linked }
  }

  async getAchievementSummary(cycleId: string, userId: string): Promise<GoalAchievementSummary> {
    const cycle = await this.delegates.evaluationCycle.findUnique({ where: { id: cycleId } })
    if (!cycle) throw new EvaluationCycleNotFoundError(cycleId)

    const rows = await this.delegates.goalAchievement.findMany({
      where: { cycleId, userId },
      orderBy: { linkedAt: 'asc' } as unknown,
    })
    const records = rows.map(toAchievementRecord)
    return buildSummary(userId, records)
  }

  async listCycleAchievements(cycleId: string): Promise<GoalAchievementSummary[]> {
    const cycle = await this.delegates.evaluationCycle.findUnique({ where: { id: cycleId } })
    if (!cycle) throw new EvaluationCycleNotFoundError(cycleId)

    const rows = await this.delegates.goalAchievement.findMany({
      where: { cycleId },
      orderBy: [{ userId: 'asc' }, { linkedAt: 'asc' }] as unknown,
    })
    const records = rows.map(toAchievementRecord)

    // userId ごとにグループ化
    const byUser = new Map<string, GoalAchievementRecord[]>()
    for (const record of records) {
      const existing = byUser.get(record.userId) ?? []
      byUser.set(record.userId, [...existing, record])
    }

    return Array.from(byUser.entries()).map(([userId, userRecords]) =>
      buildSummary(userId, userRecords),
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createGoalAchievementService(db: PrismaClient): GoalAchievementService {
  return new GoalAchievementServiceImpl(db)
}
