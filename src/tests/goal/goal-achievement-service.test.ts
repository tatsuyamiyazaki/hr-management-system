/**
 * Issue #46 / Task 13.5: GoalAchievementService 単体テスト (Req 6.9)
 *
 * テスト対象:
 * - createCycle: サイクル作成
 * - linkGoalsToCycle: 期間内の目標がスナップショット保存される
 * - getAchievementSummary: 平均進捗率・完了数計算
 * - listCycleAchievements: 複数ユーザーのサマリ一覧
 */
import { describe, it, expect, vi } from 'vitest'
import { createGoalAchievementService } from '@/lib/goal/goal-achievement-service'
import {
  EvaluationCycleNotFoundError,
  type EvaluationCycleRecord,
  type GoalAchievementRecord,
} from '@/lib/goal/goal-achievement-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-19T09:00:00.000Z')

function makeCycleRecord(overrides: Partial<EvaluationCycleRecord> = {}): EvaluationCycleRecord {
  return {
    id: 'cycle-1',
    name: '2026 Q1 評価',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    createdAt: FIXED_NOW,
    ...overrides,
  }
}

function makeAchievementRecord(
  overrides: Partial<GoalAchievementRecord> = {},
): GoalAchievementRecord {
  return {
    id: 'ach-1',
    cycleId: 'cycle-1',
    goalId: 'goal-1',
    userId: 'user-1',
    finalProgress: 80,
    isCompleted: false,
    achievementNote: null,
    linkedAt: FIXED_NOW,
    ...overrides,
  }
}

type PersonalGoalRow = {
  id: string
  userId: string
  status: string
  endDate: Date
  progressHistory: Array<{ progressRate: number; recordedAt: Date }>
}

function makePrisma({
  cycleRow = makeCycleRecord() as EvaluationCycleRecord | null,
  achievementRows = [] as GoalAchievementRecord[],
  personalGoalRows = [] as PersonalGoalRow[],
  upsertResult = makeAchievementRecord(),
} = {}) {
  return {
    evaluationCycle: {
      create: vi.fn().mockResolvedValue(cycleRow),
      findUnique: vi.fn().mockResolvedValue(cycleRow),
    },
    goalAchievement: {
      upsert: vi.fn().mockResolvedValue(upsertResult),
      findMany: vi.fn().mockResolvedValue(achievementRows),
    },
    personalGoal: {
      findMany: vi.fn().mockResolvedValue(personalGoalRows),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GoalAchievementService', () => {
  // ── createCycle ────────────────────────────────────────────────────────────

  describe('createCycle', () => {
    it('評価サイクルを作成して返す', async () => {
      // Arrange
      const cycle = makeCycleRecord()
      const db = makePrisma({ cycleRow: cycle })
      const svc = createGoalAchievementService(db as never)

      // Act
      const result = await svc.createCycle({
        name: '2026 Q1 評価',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
      })

      // Assert
      expect(result.id).toBe('cycle-1')
      expect(result.name).toBe('2026 Q1 評価')
      expect(db.evaluationCycle.create).toHaveBeenCalledOnce()
    })
  })

  // ── linkGoalsToCycle ───────────────────────────────────────────────────────

  describe('linkGoalsToCycle', () => {
    it('期間内の目標をスナップショット保存して linked 件数を返す', async () => {
      // Arrange
      const goalRows: PersonalGoalRow[] = [
        {
          id: 'goal-1',
          userId: 'user-1',
          status: 'IN_PROGRESS',
          endDate: new Date('2026-02-28'),
          progressHistory: [{ progressRate: 75, recordedAt: new Date('2026-02-01') }],
        },
        {
          id: 'goal-2',
          userId: 'user-2',
          status: 'COMPLETED',
          endDate: new Date('2026-03-15'),
          progressHistory: [{ progressRate: 100, recordedAt: new Date('2026-03-15') }],
        },
      ]
      const db = makePrisma({ personalGoalRows: goalRows })
      const svc = createGoalAchievementService(db as never)

      // Act
      const result = await svc.linkGoalsToCycle('cycle-1')

      // Assert
      expect(result.linked).toBe(2)
      expect(db.goalAchievement.upsert).toHaveBeenCalledTimes(2)
    })

    it('COMPLETED ステータスの目標は isCompleted=true でスナップショット保存される', async () => {
      // Arrange
      const goalRows: PersonalGoalRow[] = [
        {
          id: 'goal-1',
          userId: 'user-1',
          status: 'COMPLETED',
          endDate: new Date('2026-02-28'),
          progressHistory: [{ progressRate: 100, recordedAt: new Date('2026-02-28') }],
        },
      ]
      const db = makePrisma({ personalGoalRows: goalRows })
      const svc = createGoalAchievementService(db as never)

      // Act
      await svc.linkGoalsToCycle('cycle-1')

      // Assert
      const upsertCall = db.goalAchievement.upsert.mock.calls[0]![0] as {
        create: { isCompleted: boolean; finalProgress: number }
      }
      expect(upsertCall.create.isCompleted).toBe(true)
      expect(upsertCall.create.finalProgress).toBe(100)
    })

    it('進捗履歴がない目標は finalProgress=0 になる', async () => {
      // Arrange
      const goalRows: PersonalGoalRow[] = [
        {
          id: 'goal-1',
          userId: 'user-1',
          status: 'DRAFT',
          endDate: new Date('2026-02-28'),
          progressHistory: [],
        },
      ]
      const db = makePrisma({ personalGoalRows: goalRows })
      const svc = createGoalAchievementService(db as never)

      // Act
      await svc.linkGoalsToCycle('cycle-1')

      // Assert
      const upsertCall = db.goalAchievement.upsert.mock.calls[0]![0] as {
        create: { finalProgress: number }
      }
      expect(upsertCall.create.finalProgress).toBe(0)
    })

    it('サイクルが存在しない場合 EvaluationCycleNotFoundError をスローする', async () => {
      // Arrange
      const db = makePrisma({ cycleRow: null })
      const svc = createGoalAchievementService(db as never)

      // Act & Assert
      await expect(svc.linkGoalsToCycle('nonexistent')).rejects.toThrow(
        EvaluationCycleNotFoundError,
      )
    })
  })

  // ── getAchievementSummary ──────────────────────────────────────────────────

  describe('getAchievementSummary', () => {
    it('ユーザーの平均進捗率・完了数を正しく計算する', async () => {
      // Arrange
      const achievementRows = [
        makeAchievementRecord({ goalId: 'goal-1', finalProgress: 80, isCompleted: false }),
        makeAchievementRecord({
          id: 'ach-2',
          goalId: 'goal-2',
          finalProgress: 100,
          isCompleted: true,
        }),
        makeAchievementRecord({
          id: 'ach-3',
          goalId: 'goal-3',
          finalProgress: 60,
          isCompleted: false,
        }),
      ]
      const db = makePrisma({ achievementRows })
      const svc = createGoalAchievementService(db as never)

      // Act
      const summary = await svc.getAchievementSummary('cycle-1', 'user-1')

      // Assert
      expect(summary.userId).toBe('user-1')
      expect(summary.totalGoals).toBe(3)
      expect(summary.completedGoals).toBe(1)
      expect(summary.averageProgress).toBe(80) // (80+100+60)/3 = 80
      expect(summary.achievements).toHaveLength(3)
    })

    it('達成記録が0件の場合 averageProgress=0 を返す', async () => {
      // Arrange
      const db = makePrisma({ achievementRows: [] })
      const svc = createGoalAchievementService(db as never)

      // Act
      const summary = await svc.getAchievementSummary('cycle-1', 'user-1')

      // Assert
      expect(summary.totalGoals).toBe(0)
      expect(summary.completedGoals).toBe(0)
      expect(summary.averageProgress).toBe(0)
    })

    it('サイクルが存在しない場合 EvaluationCycleNotFoundError をスローする', async () => {
      // Arrange
      const db = makePrisma({ cycleRow: null })
      const svc = createGoalAchievementService(db as never)

      // Act & Assert
      await expect(svc.getAchievementSummary('nonexistent', 'user-1')).rejects.toThrow(
        EvaluationCycleNotFoundError,
      )
    })
  })

  // ── listCycleAchievements ──────────────────────────────────────────────────

  describe('listCycleAchievements', () => {
    it('複数ユーザーの達成率サマリ一覧をユーザーごとにグループ化して返す', async () => {
      // Arrange
      const achievementRows = [
        makeAchievementRecord({
          id: 'ach-1',
          goalId: 'goal-1',
          userId: 'user-1',
          finalProgress: 90,
          isCompleted: true,
        }),
        makeAchievementRecord({
          id: 'ach-2',
          goalId: 'goal-2',
          userId: 'user-1',
          finalProgress: 70,
          isCompleted: false,
        }),
        makeAchievementRecord({
          id: 'ach-3',
          goalId: 'goal-3',
          userId: 'user-2',
          finalProgress: 50,
          isCompleted: false,
        }),
      ]
      const db = makePrisma({ achievementRows })
      const svc = createGoalAchievementService(db as never)

      // Act
      const summaries = await svc.listCycleAchievements('cycle-1')

      // Assert
      expect(summaries).toHaveLength(2)

      const user1Summary = summaries.find((s) => s.userId === 'user-1')
      expect(user1Summary?.totalGoals).toBe(2)
      expect(user1Summary?.completedGoals).toBe(1)
      expect(user1Summary?.averageProgress).toBe(80) // (90+70)/2 = 80

      const user2Summary = summaries.find((s) => s.userId === 'user-2')
      expect(user2Summary?.totalGoals).toBe(1)
      expect(user2Summary?.completedGoals).toBe(0)
      expect(user2Summary?.averageProgress).toBe(50)
    })

    it('サイクルが存在しない場合 EvaluationCycleNotFoundError をスローする', async () => {
      // Arrange
      const db = makePrisma({ cycleRow: null })
      const svc = createGoalAchievementService(db as never)

      // Act & Assert
      await expect(svc.listCycleAchievements('nonexistent')).rejects.toThrow(
        EvaluationCycleNotFoundError,
      )
    })
  })
})
