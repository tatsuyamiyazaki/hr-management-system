/**
 * Issue #49 / Req 7.6, 7.7, 7.8: OneOnOneReminderService 単体テスト
 *
 * - 30日超のログなし部下が検出されるテスト
 * - 29日以内のログある部下はスキップされるテスト
 * - 評価期間リンク取得テスト
 * - 全ログ一覧ページネーションテスト
 */
import { describe, it, expect } from 'vitest'
import {
  createOneOnOneReminderService,
  MISSING_LOG_THRESHOLD_DAYS,
  type ManagerSubordinateRepository,
  type OneOnOneSessionRepository,
} from '@/lib/one-on-one/one-on-one-reminder-service'
import { createInMemoryNotificationRepository } from '@/lib/notification/notification-repository'
import type {
  MissingLogEmployee,
  EvaluationLogLink,
  AllLogEntry,
} from '@/lib/one-on-one/one-on-one-reminder-types'

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-19T00:00:00.000Z')

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

function makeSub(
  overrides: Partial<MissingLogEmployee> & { managerId: string; employeeId: string },
): MissingLogEmployee {
  return {
    lastLogDate: daysAgo(MISSING_LOG_THRESHOLD_DAYS),
    daysSinceLastLog: MISSING_LOG_THRESHOLD_DAYS,
    ...overrides,
  }
}

function makeSubordinateRepo(subs: readonly MissingLogEmployee[]): ManagerSubordinateRepository {
  return {
    async findAllSubordinatesWithLastLog() {
      return subs
    },
  }
}

function makeSessionRepo(
  links: readonly EvaluationLogLink[] = [],
  logs: readonly AllLogEntry[] = [],
): OneOnOneSessionRepository {
  return {
    async findSessionsInRange() {
      return links
    },
    async listAllLogs(query) {
      const start = (query.page - 1) * query.limit
      const paginated = logs.slice(start, start + query.limit)
      return { data: paginated, total: logs.length }
    },
  }
}

function makeService(
  subs: readonly MissingLogEmployee[],
  links: readonly EvaluationLogLink[] = [],
  logs: readonly AllLogEntry[] = [],
) {
  const notificationRepo = createInMemoryNotificationRepository()
  const svc = createOneOnOneReminderService({
    subordinateRepo: makeSubordinateRepo(subs),
    sessionRepo: makeSessionRepo(links, logs),
    notificationRepo,
  })
  return { svc, notificationRepo }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: scanMissingLogs
// ─────────────────────────────────────────────────────────────────────────────

describe('OneOnOneReminderService.scanMissingLogs', () => {
  describe('30日超のログなし部下が検出される', () => {
    it('ちょうど30日前のログがある部下は通知される', async () => {
      // Arrange
      const sub = makeSub({
        managerId: 'mgr-1',
        employeeId: 'emp-1',
        lastLogDate: daysAgo(30),
        daysSinceLastLog: 30,
      })
      const { svc, notificationRepo } = makeService([sub])

      // Act
      const result = await svc.scanMissingLogs(NOW)

      // Assert
      expect(result.notified).toBe(1)
      expect(result.skipped).toBe(0)
      const notifications = await notificationRepo.listByUser('mgr-1')
      expect(notifications).toHaveLength(1)
      expect(notifications[0].category).toBe('DEADLINE_ALERT')
      expect(notifications[0].userId).toBe('mgr-1')
    })

    it('31日前のログがある部下は通知される', async () => {
      // Arrange
      const sub = makeSub({
        managerId: 'mgr-1',
        employeeId: 'emp-2',
        lastLogDate: daysAgo(31),
        daysSinceLastLog: 31,
      })
      const { svc } = makeService([sub])

      // Act
      const result = await svc.scanMissingLogs(NOW)

      // Assert
      expect(result.notified).toBe(1)
      expect(result.skipped).toBe(0)
    })

    it('一度もログがない部下は通知される', async () => {
      // Arrange
      const sub = makeSub({
        managerId: 'mgr-2',
        employeeId: 'emp-3',
        lastLogDate: null,
        daysSinceLastLog: MISSING_LOG_THRESHOLD_DAYS,
      })
      const { svc, notificationRepo } = makeService([sub])

      // Act
      const result = await svc.scanMissingLogs(NOW)

      // Assert
      expect(result.notified).toBe(1)
      expect(result.skipped).toBe(0)
      const notifications = await notificationRepo.listByUser('mgr-2')
      expect(notifications[0].title).toBe('1on1ログが未入力です')
    })

    it('複数の部下が閾値超えの場合、全員通知される', async () => {
      // Arrange
      const subs = [
        makeSub({
          managerId: 'mgr-3',
          employeeId: 'emp-4',
          lastLogDate: daysAgo(35),
          daysSinceLastLog: 35,
        }),
        makeSub({
          managerId: 'mgr-3',
          employeeId: 'emp-5',
          lastLogDate: null,
          daysSinceLastLog: 30,
        }),
      ]
      const { svc } = makeService(subs)

      // Act
      const result = await svc.scanMissingLogs(NOW)

      // Assert
      expect(result.notified).toBe(2)
      expect(result.skipped).toBe(0)
    })
  })

  describe('29日以内のログがある部下はスキップされる', () => {
    it('29日前のログがある部下はスキップされる', async () => {
      // Arrange
      const sub = makeSub({
        managerId: 'mgr-4',
        employeeId: 'emp-6',
        lastLogDate: daysAgo(29),
        daysSinceLastLog: 29,
      })
      const { svc } = makeService([sub])

      // Act
      const result = await svc.scanMissingLogs(NOW)

      // Assert
      expect(result.notified).toBe(0)
      expect(result.skipped).toBe(1)
    })

    it('1日前のログがある部下はスキップされる', async () => {
      // Arrange
      const sub = makeSub({
        managerId: 'mgr-4',
        employeeId: 'emp-7',
        lastLogDate: daysAgo(1),
        daysSinceLastLog: 1,
      })
      const { svc } = makeService([sub])

      // Act
      const result = await svc.scanMissingLogs(NOW)

      // Assert
      expect(result.notified).toBe(0)
      expect(result.skipped).toBe(1)
    })

    it('通知すべき部下とスキップすべき部下が混在する場合、それぞれ正しくカウントされる', async () => {
      // Arrange
      const subs = [
        makeSub({
          managerId: 'mgr-5',
          employeeId: 'emp-8',
          lastLogDate: daysAgo(30),
          daysSinceLastLog: 30,
        }), // 通知
        makeSub({
          managerId: 'mgr-5',
          employeeId: 'emp-9',
          lastLogDate: daysAgo(29),
          daysSinceLastLog: 29,
        }), // スキップ
        makeSub({
          managerId: 'mgr-5',
          employeeId: 'emp-10',
          lastLogDate: null,
          daysSinceLastLog: 30,
        }), // 通知
        makeSub({
          managerId: 'mgr-5',
          employeeId: 'emp-11',
          lastLogDate: daysAgo(10),
          daysSinceLastLog: 10,
        }), // スキップ
      ]
      const { svc } = makeService(subs)

      // Act
      const result = await svc.scanMissingLogs(NOW)

      // Assert
      expect(result.notified).toBe(2)
      expect(result.skipped).toBe(2)
    })
  })

  describe('部下がいない / now 省略', () => {
    it('部下が0件のとき notified/skipped ともに 0', async () => {
      // Arrange
      const { svc } = makeService([])

      // Act
      const result = await svc.scanMissingLogs(NOW)

      // Assert
      expect(result.notified).toBe(0)
      expect(result.skipped).toBe(0)
    })

    it('now を省略しても正常に動作する', async () => {
      // Arrange
      const { svc } = makeService([])

      // Act
      const result = await svc.scanMissingLogs()

      // Assert
      expect(result.notified).toBe(0)
      expect(result.skipped).toBe(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests: getEvaluationLinks
// ─────────────────────────────────────────────────────────────────────────────

describe('OneOnOneReminderService.getEvaluationLinks', () => {
  it('指定期間のセッションリンクを返す', async () => {
    // Arrange
    const links: EvaluationLogLink[] = [
      {
        sessionId: 'sess-1',
        scheduledAt: new Date('2026-03-01T10:00:00Z'),
        logId: 'log-1',
        hasLog: true,
      },
      {
        sessionId: 'sess-2',
        scheduledAt: new Date('2026-03-15T10:00:00Z'),
        logId: null,
        hasLog: false,
      },
    ]
    const { svc } = makeService([], links)
    const from = new Date('2026-03-01T00:00:00Z')
    const to = new Date('2026-03-31T23:59:59Z')

    // Act
    const result = await svc.getEvaluationLinks('emp-1', from, to)

    // Assert
    expect(result).toHaveLength(2)
    expect(result[0].sessionId).toBe('sess-1')
    expect(result[0].hasLog).toBe(true)
    expect(result[1].sessionId).toBe('sess-2')
    expect(result[1].hasLog).toBe(false)
    expect(result[1].logId).toBeNull()
  })

  it('対象期間にセッションがない場合は空配列を返す', async () => {
    // Arrange
    const { svc } = makeService([], [])
    const from = new Date('2026-03-01T00:00:00Z')
    const to = new Date('2026-03-31T23:59:59Z')

    // Act
    const result = await svc.getEvaluationLinks('emp-1', from, to)

    // Assert
    expect(result).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests: listAllLogs (ページネーション)
// ─────────────────────────────────────────────────────────────────────────────

describe('OneOnOneReminderService.listAllLogs', () => {
  function makeLogs(count: number): AllLogEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      logId: `log-${i + 1}`,
      sessionId: `sess-${i + 1}`,
      managerId: 'mgr-1',
      employeeId: 'emp-1',
      scheduledAt: new Date('2026-03-01T10:00:00Z'),
      content: `ログ内容 ${i + 1}`,
      visibility: (i % 2 === 0 ? 'MANAGER_ONLY' : 'BOTH') as 'MANAGER_ONLY' | 'BOTH',
      recordedAt: new Date('2026-03-01T12:00:00Z'),
    }))
  }

  it('page=1, limit=5 のとき最初の5件と total を返す', async () => {
    // Arrange
    const logs = makeLogs(12)
    const { svc } = makeService([], [], logs)

    // Act
    const result = await svc.listAllLogs({ page: 1, limit: 5 })

    // Assert
    expect(result.data).toHaveLength(5)
    expect(result.total).toBe(12)
    expect(result.data[0].logId).toBe('log-1')
  })

  it('page=2, limit=5 のとき次の5件を返す', async () => {
    // Arrange
    const logs = makeLogs(12)
    const { svc } = makeService([], [], logs)

    // Act
    const result = await svc.listAllLogs({ page: 2, limit: 5 })

    // Assert
    expect(result.data).toHaveLength(5)
    expect(result.data[0].logId).toBe('log-6')
  })

  it('最終ページが端数の場合、残り件数のみ返す', async () => {
    // Arrange
    const logs = makeLogs(12)
    const { svc } = makeService([], [], logs)

    // Act
    const result = await svc.listAllLogs({ page: 3, limit: 5 })

    // Assert
    expect(result.data).toHaveLength(2)
    expect(result.total).toBe(12)
  })

  it('ログが0件のとき空配列と total=0 を返す', async () => {
    // Arrange
    const { svc } = makeService([], [], [])

    // Act
    const result = await svc.listAllLogs({ page: 1, limit: 20 })

    // Assert
    expect(result.data).toHaveLength(0)
    expect(result.total).toBe(0)
  })
})
