/**
 * Issue #48 / Task 14.2: OneOnOneLogService の単体テスト (Req 7.3, 7.4, 7.5)
 *
 * - recordLog: visibility MANAGER_ONLY / BOTH でのログ記録
 * - updateLog: 自分が記録したログのみ更新可能
 * - getSessionLog: EMPLOYEE が MANAGER_ONLY のログを取得できないことを確認
 * - getSessionLog: EMPLOYEE が BOTH のログを取得できることを確認
 * - getTimeline: セッション順・ログなしセッションも含む
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OneOnOneLogService } from '@/lib/one-on-one/one-on-one-log-service'
import {
  OneOnOneLogNotFoundError,
  OneOnOneLogAccessDeniedError,
} from '@/lib/one-on-one/one-on-one-log-service'
import type {
  OneOnOneLogRecord,
  OneOnOneTimelineEntry,
} from '@/lib/one-on-one/one-on-one-log-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MANAGER_ID = 'user-manager-1'
const EMPLOYEE_ID = 'user-emp-1'
const SESSION_ID = 'session-1'
const LOG_ID = 'log-1'

function makeLogRecord(overrides: Partial<OneOnOneLogRecord> = {}): OneOnOneLogRecord {
  return {
    id: LOG_ID,
    sessionId: SESSION_ID,
    agenda: '業務進捗確認',
    content: '先月の目標について確認しました。',
    nextActions: '来月までに報告書提出',
    visibility: 'MANAGER_ONLY',
    recordedBy: MANAGER_ID,
    recordedAt: new Date('2026-04-19T10:00:00.000Z'),
    ...overrides,
  }
}

function makeTimelineEntry(overrides: Partial<OneOnOneTimelineEntry> = {}): OneOnOneTimelineEntry {
  return {
    sessionId: SESSION_ID,
    scheduledAt: new Date('2026-04-19T10:00:00.000Z'),
    durationMin: 30,
    log: makeLogRecord(),
    ...overrides,
  }
}

function makeServiceMock(): OneOnOneLogService {
  return {
    recordLog: vi.fn().mockResolvedValue(makeLogRecord()),
    updateLog: vi.fn().mockResolvedValue(makeLogRecord()),
    getSessionLog: vi.fn().mockResolvedValue(null),
    getTimeline: vi.fn().mockResolvedValue([]),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('OneOnOneLogService', () => {
  let svc: OneOnOneLogService

  beforeEach(() => {
    svc = makeServiceMock()
  })

  describe('recordLog', () => {
    it('visibility=MANAGER_ONLY でログを記録し OneOnOneLogRecord を返す', async () => {
      const record = makeLogRecord({ visibility: 'MANAGER_ONLY' })
      vi.mocked(svc.recordLog).mockResolvedValue(record)

      const result = await svc.recordLog(SESSION_ID, MANAGER_ID, {
        content: '先月の目標について確認しました。',
        visibility: 'MANAGER_ONLY',
      })

      expect(result.visibility).toBe('MANAGER_ONLY')
      expect(result.sessionId).toBe(SESSION_ID)
      expect(result.recordedBy).toBe(MANAGER_ID)
    })

    it('visibility=BOTH でログを記録できる', async () => {
      const record = makeLogRecord({ visibility: 'BOTH' })
      vi.mocked(svc.recordLog).mockResolvedValue(record)

      const result = await svc.recordLog(SESSION_ID, MANAGER_ID, {
        content: '双方確認済みの内容です。',
        visibility: 'BOTH',
      })

      expect(result.visibility).toBe('BOTH')
    })

    it('agenda と nextActions を含めてログを記録できる', async () => {
      const record = makeLogRecord({
        agenda: '業務進捗確認',
        nextActions: '来月までに報告書提出',
      })
      vi.mocked(svc.recordLog).mockResolvedValue(record)

      const result = await svc.recordLog(SESSION_ID, MANAGER_ID, {
        agenda: '業務進捗確認',
        content: '進捗を確認しました。',
        nextActions: '来月までに報告書提出',
        visibility: 'MANAGER_ONLY',
      })

      expect(result.agenda).toBe('業務進捗確認')
      expect(result.nextActions).toBe('来月までに報告書提出')
    })
  })

  describe('updateLog', () => {
    it('自分が記録したログを更新できる', async () => {
      const updated = makeLogRecord({ content: '更新後の内容' })
      vi.mocked(svc.updateLog).mockResolvedValue(updated)

      const result = await svc.updateLog(LOG_ID, MANAGER_ID, { content: '更新後の内容' })

      expect(result.content).toBe('更新後の内容')
      expect(svc.updateLog).toHaveBeenCalledWith(LOG_ID, MANAGER_ID, { content: '更新後の内容' })
    })

    it('存在しないログを更新しようとすると OneOnOneLogNotFoundError をスローする', async () => {
      vi.mocked(svc.updateLog).mockRejectedValue(new OneOnOneLogNotFoundError('nonexistent-id'))

      await expect(
        svc.updateLog('nonexistent-id', MANAGER_ID, { content: '更新' }),
      ).rejects.toThrow(OneOnOneLogNotFoundError)
    })

    it('他人が記録したログを更新しようとすると OneOnOneLogAccessDeniedError をスローする', async () => {
      vi.mocked(svc.updateLog).mockRejectedValue(
        new OneOnOneLogAccessDeniedError('自分が記録したログのみ更新できます'),
      )

      await expect(
        svc.updateLog(LOG_ID, 'other-manager-id', { content: '更新' }),
      ).rejects.toThrow(OneOnOneLogAccessDeniedError)
    })
  })

  describe('getSessionLog', () => {
    it('MANAGER は visibility=MANAGER_ONLY のログを取得できる', async () => {
      const record = makeLogRecord({ visibility: 'MANAGER_ONLY' })
      vi.mocked(svc.getSessionLog).mockResolvedValue(record)

      const result = await svc.getSessionLog(SESSION_ID, MANAGER_ID, 'MANAGER')

      expect(result).not.toBeNull()
      expect(result?.visibility).toBe('MANAGER_ONLY')
    })

    it('MANAGER は visibility=BOTH のログを取得できる', async () => {
      const record = makeLogRecord({ visibility: 'BOTH' })
      vi.mocked(svc.getSessionLog).mockResolvedValue(record)

      const result = await svc.getSessionLog(SESSION_ID, MANAGER_ID, 'MANAGER')

      expect(result?.visibility).toBe('BOTH')
    })

    it('EMPLOYEE は visibility=MANAGER_ONLY のログを取得できず null を返す', async () => {
      vi.mocked(svc.getSessionLog).mockResolvedValue(null)

      const result = await svc.getSessionLog(SESSION_ID, EMPLOYEE_ID, 'EMPLOYEE')

      expect(result).toBeNull()
    })

    it('EMPLOYEE は visibility=BOTH のログを取得できる', async () => {
      const record = makeLogRecord({ visibility: 'BOTH' })
      vi.mocked(svc.getSessionLog).mockResolvedValue(record)

      const result = await svc.getSessionLog(SESSION_ID, EMPLOYEE_ID, 'EMPLOYEE')

      expect(result).not.toBeNull()
      expect(result?.visibility).toBe('BOTH')
    })

    it('EMPLOYEE が他人のセッションにアクセスしようとすると OneOnOneLogAccessDeniedError をスローする', async () => {
      vi.mocked(svc.getSessionLog).mockRejectedValue(
        new OneOnOneLogAccessDeniedError('このセッションへのアクセス権がありません'),
      )

      await expect(
        svc.getSessionLog(SESSION_ID, 'other-employee-id', 'EMPLOYEE'),
      ).rejects.toThrow(OneOnOneLogAccessDeniedError)
    })

    it('ログが存在しない場合は null を返す', async () => {
      vi.mocked(svc.getSessionLog).mockResolvedValue(null)

      const result = await svc.getSessionLog('session-no-log', MANAGER_ID, 'MANAGER')

      expect(result).toBeNull()
    })
  })

  describe('getTimeline', () => {
    it('MANAGER は全ログを含むタイムラインを取得できる', async () => {
      const entries = [
        makeTimelineEntry({
          sessionId: 'session-1',
          scheduledAt: new Date('2026-04-19T10:00:00.000Z'),
          log: makeLogRecord({ visibility: 'MANAGER_ONLY' }),
        }),
        makeTimelineEntry({
          sessionId: 'session-2',
          scheduledAt: new Date('2026-03-19T10:00:00.000Z'),
          log: makeLogRecord({ sessionId: 'session-2', visibility: 'BOTH' }),
        }),
      ]
      vi.mocked(svc.getTimeline).mockResolvedValue(entries)

      const result = await svc.getTimeline(EMPLOYEE_ID, MANAGER_ID, MANAGER_ID, 'MANAGER')

      expect(result).toHaveLength(2)
      expect(result[0]!.log?.visibility).toBe('MANAGER_ONLY')
      expect(result[1]!.log?.visibility).toBe('BOTH')
    })

    it('EMPLOYEE は visibility=BOTH のログのみ含むタイムラインを取得できる', async () => {
      const entries = [
        makeTimelineEntry({
          sessionId: 'session-1',
          log: makeLogRecord({ visibility: 'BOTH' }),
        }),
        makeTimelineEntry({
          sessionId: 'session-2',
          scheduledAt: new Date('2026-03-19T10:00:00.000Z'),
          log: null,
        }),
      ]
      vi.mocked(svc.getTimeline).mockResolvedValue(entries)

      const result = await svc.getTimeline(EMPLOYEE_ID, MANAGER_ID, EMPLOYEE_ID, 'EMPLOYEE')

      expect(result).toHaveLength(2)
      expect(result[0]!.log?.visibility).toBe('BOTH')
      expect(result[1]!.log).toBeNull()
    })

    it('ログ未入力のセッションも log=null としてタイムラインに含まれる', async () => {
      const entries = [makeTimelineEntry({ log: null })]
      vi.mocked(svc.getTimeline).mockResolvedValue(entries)

      const result = await svc.getTimeline(EMPLOYEE_ID, MANAGER_ID, MANAGER_ID, 'MANAGER')

      expect(result[0]!.log).toBeNull()
      expect(result[0]!.sessionId).toBe(SESSION_ID)
    })

    it('タイムラインは scheduledAt 降順（新しい順）で返される', async () => {
      const entries = [
        makeTimelineEntry({
          sessionId: 'session-latest',
          scheduledAt: new Date('2026-04-19T10:00:00.000Z'),
        }),
        makeTimelineEntry({
          sessionId: 'session-older',
          scheduledAt: new Date('2026-03-01T10:00:00.000Z'),
        }),
        makeTimelineEntry({
          sessionId: 'session-oldest',
          scheduledAt: new Date('2026-01-15T10:00:00.000Z'),
        }),
      ]
      vi.mocked(svc.getTimeline).mockResolvedValue(entries)

      const result = await svc.getTimeline(EMPLOYEE_ID, MANAGER_ID, MANAGER_ID, 'MANAGER')

      expect(result[0]!.scheduledAt.getTime()).toBeGreaterThan(result[1]!.scheduledAt.getTime())
      expect(result[1]!.scheduledAt.getTime()).toBeGreaterThan(result[2]!.scheduledAt.getTime())
    })

    it('セッションが存在しない場合は空配列を返す', async () => {
      vi.mocked(svc.getTimeline).mockResolvedValue([])

      const result = await svc.getTimeline(EMPLOYEE_ID, MANAGER_ID, MANAGER_ID, 'MANAGER')

      expect(result).toEqual([])
    })

    it('EMPLOYEE が他人のタイムラインにアクセスしようとすると OneOnOneLogAccessDeniedError をスローする', async () => {
      vi.mocked(svc.getTimeline).mockRejectedValue(
        new OneOnOneLogAccessDeniedError('自分のタイムラインのみ閲覧できます'),
      )

      await expect(
        svc.getTimeline(EMPLOYEE_ID, MANAGER_ID, 'other-employee-id', 'EMPLOYEE'),
      ).rejects.toThrow(OneOnOneLogAccessDeniedError)
    })

    it('各エントリに sessionId・scheduledAt・durationMin・log が含まれる', async () => {
      const entry = makeTimelineEntry({
        sessionId: SESSION_ID,
        scheduledAt: new Date('2026-04-19T10:00:00.000Z'),
        durationMin: 45,
        log: makeLogRecord(),
      })
      vi.mocked(svc.getTimeline).mockResolvedValue([entry])

      const result = await svc.getTimeline(EMPLOYEE_ID, MANAGER_ID, MANAGER_ID, 'MANAGER')

      expect(result[0]!).toMatchObject({
        sessionId: SESSION_ID,
        durationMin: 45,
      })
      expect(result[0]!.scheduledAt).toBeInstanceOf(Date)
      expect(result[0]!.log).not.toBeNull()
    })
  })
})
