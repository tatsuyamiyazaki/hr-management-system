/**
 * Issue #45 / Req 6.8: DeadlineAlertService 単体テスト
 *
 * - 期限7日以内・進捗50%未満の目標が検出されるテスト
 * - 期限7日超の目標はスキップされるテスト
 * - 進捗50%以上の目標はスキップされるテスト
 * - daysUntilDeadline が 0,1,3,7 以外（例: 5）はスキップされるテスト
 */
import { describe, it, expect } from 'vitest'
import {
  createDeadlineAlertService,
  type DeadlineAlertGoalRepository,
  type GoalWithLatestProgress,
} from '@/lib/goal/deadline-alert-service'
import { createInMemoryNotificationRepository } from '@/lib/notification/notification-repository'
import type { NotificationRepository } from '@/lib/notification/notification-repository'

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-19T00:00:00.000Z')

/** daysFromNow 日後の Date を返す */
function daysLater(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000)
}

function makeGoal(
  overrides: Partial<GoalWithLatestProgress> & { id: string },
): GoalWithLatestProgress {
  return {
    userId: 'user-1',
    title: 'テスト目標',
    endDate: daysLater(3),
    latestProgressRate: 30,
    ...overrides,
  }
}

function makeGoalRepo(goals: readonly GoalWithLatestProgress[]): DeadlineAlertGoalRepository {
  return {
    async findInProgressGoalsNearDeadline() {
      return goals
    },
  }
}

function makeService(
  goals: readonly GoalWithLatestProgress[],
  notificationRepo?: NotificationRepository,
) {
  const notifRepo = notificationRepo ?? createInMemoryNotificationRepository()
  const svc = createDeadlineAlertService({
    goalRepo: makeGoalRepo(goals),
    notificationRepo: notifRepo,
  })
  return { svc, notifRepo }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('DeadlineAlertService.scanDeadlineAlerts', () => {
  describe('期限7日以内・進捗50%未満の目標が検出される', () => {
    it('残り7日・進捗0%の目標は通知される', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g1', endDate: daysLater(7), latestProgressRate: 0 })
      const { svc, notifRepo } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.notified).toBe(1)
      expect(result.skipped).toBe(0)
      const notifications = await notifRepo.listByUser('user-1')
      expect(notifications).toHaveLength(1)
      expect(notifications[0]!.category).toBe('DEADLINE_ALERT')
    })

    it('残り3日・進捗30%の目標は通知される', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g2', endDate: daysLater(3), latestProgressRate: 30 })
      const { svc, notifRepo } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.notified).toBe(1)
      expect(result.skipped).toBe(0)
      const notifications = await notifRepo.listByUser('user-1')
      expect(notifications[0]!.title).toContain('3日')
    })

    it('残り1日・進捗49%の目標は通知される', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g3', endDate: daysLater(1), latestProgressRate: 49 })
      const { svc } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.notified).toBe(1)
      expect(result.skipped).toBe(0)
    })

    it('残り0日（当日）・進捗10%の目標は通知される', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g4', endDate: daysLater(0), latestProgressRate: 10 })
      const { svc, notifRepo } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.notified).toBe(1)
      const notifications = await notifRepo.listByUser('user-1')
      expect(notifications[0]!.title).toContain('本日')
    })
  })

  describe('期限7日超の目標はスキップされる', () => {
    it('残り8日の目標はスキップされる', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g5', endDate: daysLater(8), latestProgressRate: 10 })
      const { svc } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert — 残り8日は ALERT_TRIGGER_DAYS に含まれない
      expect(result.skipped).toBe(1)
      expect(result.notified).toBe(0)
    })
  })

  describe('進捗50%以上の目標はスキップされる', () => {
    it('残り3日・進捗50%の目標はスキップされる', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g6', endDate: daysLater(3), latestProgressRate: 50 })
      const { svc } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.skipped).toBe(1)
      expect(result.notified).toBe(0)
    })

    it('残り1日・進捗100%の目標はスキップされる', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g7', endDate: daysLater(1), latestProgressRate: 100 })
      const { svc } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.skipped).toBe(1)
      expect(result.notified).toBe(0)
    })
  })

  describe('daysUntilDeadline が 0,1,3,7 以外はスキップされる', () => {
    it('残り5日はスキップされる', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g8', endDate: daysLater(5), latestProgressRate: 10 })
      const { svc } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.skipped).toBe(1)
      expect(result.notified).toBe(0)
    })

    it('残り2日はスキップされる', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g9', endDate: daysLater(2), latestProgressRate: 10 })
      const { svc } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.skipped).toBe(1)
      expect(result.notified).toBe(0)
    })

    it('残り4日はスキップされる', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g10', endDate: daysLater(4), latestProgressRate: 10 })
      const { svc } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.skipped).toBe(1)
      expect(result.notified).toBe(0)
    })

    it('残り6日はスキップされる', async () => {
      // Arrange
      const goal = makeGoal({ id: 'g11', endDate: daysLater(6), latestProgressRate: 10 })
      const { svc } = makeService([goal])

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.skipped).toBe(1)
      expect(result.notified).toBe(0)
    })
  })

  describe('複数目標の混在', () => {
    it('通知すべき目標とスキップすべき目標が混在する場合、それぞれ正しくカウントされる', async () => {
      // Arrange
      const goals = [
        makeGoal({ id: 'g12', endDate: daysLater(3), latestProgressRate: 30 }), // 通知
        makeGoal({ id: 'g13', endDate: daysLater(3), latestProgressRate: 60 }), // スキップ（進捗50%以上）
        makeGoal({ id: 'g14', endDate: daysLater(5), latestProgressRate: 10 }), // スキップ（5日は対象外）
        makeGoal({ id: 'g15', endDate: daysLater(1), latestProgressRate: 0 }), // 通知
      ]
      const { svc } = makeService(goals)

      // Act
      const result = await svc.scanDeadlineAlerts(NOW)

      // Assert
      expect(result.notified).toBe(2)
      expect(result.skipped).toBe(2)
    })
  })

  describe('now 引数の省略', () => {
    it('now を省略しても正常に動作する', async () => {
      // Arrange
      const { svc } = makeService([])

      // Act
      const result = await svc.scanDeadlineAlerts()

      // Assert
      expect(result.notified).toBe(0)
      expect(result.skipped).toBe(0)
    })
  })
})
