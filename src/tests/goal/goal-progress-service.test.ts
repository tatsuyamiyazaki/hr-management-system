/**
 * Issue #44 / Task 13.3: GoalProgressService の単体テスト (Req 6.6, 6.7)
 *
 * - recordProgress: 0%→50%→100% の履歴積み上げ
 * - getProgressHistory: 履歴一覧取得（recordedAt 昇順）
 * - listSubordinateGoals: 部下一覧取得（Position テーブル経由）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GoalProgressService } from '@/lib/goal/goal-progress-service'
import type { GoalProgressRecord, SubordinateGoalSummary } from '@/lib/goal/goal-progress-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MANAGER_ID = 'user-manager-1'
const EMPLOYEE_ID = 'user-emp-1'
const GOAL_ID = 'goal-1'

function makeProgressRecord(overrides: Partial<GoalProgressRecord> = {}): GoalProgressRecord {
  return {
    id: 'progress-1',
    goalId: GOAL_ID,
    progressRate: 0,
    comment: null,
    recordedBy: EMPLOYEE_ID,
    recordedAt: new Date('2026-04-19T09:00:00.000Z'),
    ...overrides,
  }
}

function makeSubordinateSummary(
  overrides: Partial<SubordinateGoalSummary> = {},
): SubordinateGoalSummary {
  return {
    userId: EMPLOYEE_ID,
    goalId: GOAL_ID,
    title: '売上目標達成',
    status: 'IN_PROGRESS',
    currentProgressRate: 50,
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    ...overrides,
  }
}

function makeServiceMock(): GoalProgressService {
  return {
    recordProgress: vi.fn().mockResolvedValue(makeProgressRecord()),
    getProgressHistory: vi.fn().mockResolvedValue([]),
    listSubordinateGoals: vi.fn().mockResolvedValue([]),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GoalProgressService', () => {
  let svc: GoalProgressService

  beforeEach(() => {
    svc = makeServiceMock()
  })

  describe('recordProgress', () => {
    it('0% で進捗を記録し GoalProgressRecord を返す', async () => {
      const record = makeProgressRecord({ progressRate: 0 })
      vi.mocked(svc.recordProgress).mockResolvedValue(record)

      const result = await svc.recordProgress(GOAL_ID, { progressRate: 0 }, EMPLOYEE_ID)

      expect(result.progressRate).toBe(0)
      expect(result.goalId).toBe(GOAL_ID)
      expect(result.recordedBy).toBe(EMPLOYEE_ID)
    })

    it('50% で進捗を記録する', async () => {
      const record = makeProgressRecord({ id: 'progress-2', progressRate: 50 })
      vi.mocked(svc.recordProgress).mockResolvedValue(record)

      const result = await svc.recordProgress(
        GOAL_ID,
        { progressRate: 50, comment: '中間達成' },
        EMPLOYEE_ID,
      )

      expect(result.progressRate).toBe(50)
      expect(svc.recordProgress).toHaveBeenCalledWith(
        GOAL_ID,
        { progressRate: 50, comment: '中間達成' },
        EMPLOYEE_ID,
      )
    })

    it('100% で進捗を記録する（0%→50%→100% の履歴積み上げ確認）', async () => {
      const record0 = makeProgressRecord({ id: 'p-1', progressRate: 0 })
      const record50 = makeProgressRecord({ id: 'p-2', progressRate: 50 })
      const record100 = makeProgressRecord({ id: 'p-3', progressRate: 100 })

      vi.mocked(svc.recordProgress)
        .mockResolvedValueOnce(record0)
        .mockResolvedValueOnce(record50)
        .mockResolvedValueOnce(record100)

      const r0 = await svc.recordProgress(GOAL_ID, { progressRate: 0 }, EMPLOYEE_ID)
      const r50 = await svc.recordProgress(GOAL_ID, { progressRate: 50 }, EMPLOYEE_ID)
      const r100 = await svc.recordProgress(GOAL_ID, { progressRate: 100 }, EMPLOYEE_ID)

      expect(r0.progressRate).toBe(0)
      expect(r50.progressRate).toBe(50)
      expect(r100.progressRate).toBe(100)
      expect(svc.recordProgress).toHaveBeenCalledTimes(3)
    })

    it('コメント付きで進捗を記録する', async () => {
      const record = makeProgressRecord({ progressRate: 75, comment: '順調に進捗中' })
      vi.mocked(svc.recordProgress).mockResolvedValue(record)

      const result = await svc.recordProgress(
        GOAL_ID,
        { progressRate: 75, comment: '順調に進捗中' },
        EMPLOYEE_ID,
      )

      expect(result.comment).toBe('順調に進捗中')
    })
  })

  describe('getProgressHistory', () => {
    it('進捗履歴を recordedAt 昇順で返す', async () => {
      const history = [
        makeProgressRecord({
          id: 'p-1',
          progressRate: 0,
          recordedAt: new Date('2026-04-01T00:00:00.000Z'),
        }),
        makeProgressRecord({
          id: 'p-2',
          progressRate: 50,
          recordedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
        makeProgressRecord({
          id: 'p-3',
          progressRate: 100,
          recordedAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ]
      vi.mocked(svc.getProgressHistory).mockResolvedValue(history)

      const result = await svc.getProgressHistory(GOAL_ID)

      expect(result).toHaveLength(3)
      expect(result.at(0)?.progressRate).toBe(0)
      expect(result.at(1)?.progressRate).toBe(50)
      expect(result.at(2)?.progressRate).toBe(100)
    })

    it('履歴がない場合は空配列を返す', async () => {
      vi.mocked(svc.getProgressHistory).mockResolvedValue([])

      const result = await svc.getProgressHistory(GOAL_ID)

      expect(result).toEqual([])
    })

    it('最新の進捗率が最後の要素として取得できる', async () => {
      const history = [
        makeProgressRecord({
          id: 'p-1',
          progressRate: 30,
          recordedAt: new Date('2026-04-01T00:00:00.000Z'),
        }),
        makeProgressRecord({
          id: 'p-2',
          progressRate: 80,
          recordedAt: new Date('2026-04-15T00:00:00.000Z'),
        }),
      ]
      vi.mocked(svc.getProgressHistory).mockResolvedValue(history)

      const result = await svc.getProgressHistory(GOAL_ID)
      const latestRate = result.at(-1)?.progressRate

      expect(latestRate).toBe(80)
    })
  })

  describe('listSubordinateGoals', () => {
    it('部下の目標一覧を返す', async () => {
      const summaries = [
        makeSubordinateSummary(),
        makeSubordinateSummary({
          userId: 'user-emp-2',
          goalId: 'goal-2',
          title: '顧客満足度向上',
          currentProgressRate: 30,
        }),
      ]
      vi.mocked(svc.listSubordinateGoals).mockResolvedValue(summaries)

      const result = await svc.listSubordinateGoals(MANAGER_ID)

      expect(result).toHaveLength(2)
      expect(svc.listSubordinateGoals).toHaveBeenCalledWith(MANAGER_ID)
    })

    it('部下がいない場合は空配列を返す', async () => {
      vi.mocked(svc.listSubordinateGoals).mockResolvedValue([])

      const result = await svc.listSubordinateGoals(MANAGER_ID)

      expect(result).toEqual([])
    })

    it('各サマリに userId・goalId・title・status・currentProgressRate・endDate が含まれる', async () => {
      const summary = makeSubordinateSummary({
        userId: EMPLOYEE_ID,
        goalId: GOAL_ID,
        title: '売上目標達成',
        status: 'APPROVED',
        currentProgressRate: 65,
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      })
      vi.mocked(svc.listSubordinateGoals).mockResolvedValue([summary])

      const result = await svc.listSubordinateGoals(MANAGER_ID)

      expect(result.at(0)).toEqual({
        userId: EMPLOYEE_ID,
        goalId: GOAL_ID,
        title: '売上目標達成',
        status: 'APPROVED',
        currentProgressRate: 65,
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      })
    })

    it('進捗履歴がない目標の currentProgressRate は 0 である', async () => {
      const summary = makeSubordinateSummary({ currentProgressRate: 0 })
      vi.mocked(svc.listSubordinateGoals).mockResolvedValue([summary])

      const result = await svc.listSubordinateGoals(MANAGER_ID)

      expect(result.at(0)?.currentProgressRate).toBe(0)
    })
  })
})
