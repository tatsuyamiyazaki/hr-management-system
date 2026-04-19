/**
 * Issue #48 / Task 14.2: 1on1ログ タイムライン表示 サービス (Req 7.3, 7.4, 7.5)
 *
 * - recordLog: ログ記録（MANAGER のみ）
 * - updateLog: ログ更新（MANAGER のみ、自分が記録したもの）
 * - getSessionLog: セッションのログ取得（MANAGER: 全て、EMPLOYEE: BOTH のみ）
 * - getTimeline: タイムライン取得（全セッション履歴、公開範囲フィルタ付き）
 */
import { PrismaClient } from '@prisma/client'
import type {
  OneOnOneLogInput,
  OneOnOneLogRecord,
  OneOnOneTimelineEntry,
} from './one-on-one-log-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface OneOnOneLogService {
  /** ログ記録（MANAGER のみ） */
  recordLog(
    sessionId: string,
    recordedBy: string,
    input: OneOnOneLogInput,
  ): Promise<OneOnOneLogRecord>
  /** ログ更新（MANAGER のみ、自分が記録したもの） */
  updateLog(
    logId: string,
    recordedBy: string,
    input: Partial<OneOnOneLogInput>,
  ): Promise<OneOnOneLogRecord>
  /**
   * セッションのログ取得
   * MANAGER: 全て表示、EMPLOYEE: visibility=BOTH のみ
   */
  getSessionLog(
    sessionId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<OneOnOneLogRecord | null>
  /**
   * タイムライン取得（employeeId と managerId のペアの全セッション履歴）
   * MANAGER: 全ログ、EMPLOYEE: visibility=BOTH のみ
   * scheduledAt 降順
   */
  getTimeline(
    employeeId: string,
    managerId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<OneOnOneTimelineEntry[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma delegate shim (型安全アクセス)
// ─────────────────────────────────────────────────────────────────────────────

interface LogRow {
  id: string
  sessionId: string
  agenda: string | null
  content: string
  nextActions: string | null
  visibility: string
  recordedBy: string
  recordedAt: Date
}

interface SessionRow {
  id: string
  managerId: string
  employeeId: string
  scheduledAt: Date
  durationMin: number
  agenda: string | null
  logs: LogRow[]
}

interface PrismaDelegates {
  oneOnOneLog: {
    create(args: unknown): Promise<LogRow>
    findUnique(args: unknown): Promise<LogRow | null>
    update(args: unknown): Promise<LogRow>
    findFirst(args: unknown): Promise<LogRow | null>
  }
  oneOnOneSession: {
    findUnique(args: unknown): Promise<SessionRow | null>
    findMany(args: unknown): Promise<SessionRow[]>
  }
}

function asDelegates(db: PrismaClient): PrismaDelegates {
  return db as unknown as PrismaDelegates
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapLogRow(row: LogRow): OneOnOneLogRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    agenda: row.agenda,
    content: row.content,
    nextActions: row.nextActions,
    visibility: row.visibility as 'MANAGER_ONLY' | 'BOTH',
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Access control helpers
// ─────────────────────────────────────────────────────────────────────────────

const MANAGER_ROLES = new Set(['MANAGER', 'HR_MANAGER', 'ADMIN'])

function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.has(role)
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class OneOnOneLogServiceImpl implements OneOnOneLogService {
  private readonly delegates: PrismaDelegates

  constructor(db: PrismaClient) {
    this.delegates = asDelegates(db)
  }

  async recordLog(
    sessionId: string,
    recordedBy: string,
    input: OneOnOneLogInput,
  ): Promise<OneOnOneLogRecord> {
    const row = await this.delegates.oneOnOneLog.create({
      data: {
        sessionId,
        recordedBy,
        agenda: input.agenda ?? null,
        content: input.content,
        nextActions: input.nextActions ?? null,
        visibility: input.visibility,
      },
    })
    return mapLogRow(row)
  }

  async updateLog(
    logId: string,
    recordedBy: string,
    input: Partial<OneOnOneLogInput>,
  ): Promise<OneOnOneLogRecord> {
    const existing = await this.delegates.oneOnOneLog.findUnique({
      where: { id: logId },
    })
    if (!existing) {
      throw new OneOnOneLogNotFoundError(logId)
    }
    if (existing.recordedBy !== recordedBy) {
      throw new OneOnOneLogAccessDeniedError('自分が記録したログのみ更新できます')
    }

    const updateData: Record<string, unknown> = {}
    if (input.agenda !== undefined) updateData.agenda = input.agenda
    if (input.content !== undefined) updateData.content = input.content
    if (input.nextActions !== undefined) updateData.nextActions = input.nextActions
    if (input.visibility !== undefined) updateData.visibility = input.visibility

    const row = await this.delegates.oneOnOneLog.update({
      where: { id: logId },
      data: updateData,
    })
    return mapLogRow(row)
  }

  async getSessionLog(
    sessionId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<OneOnOneLogRecord | null> {
    const isManager = isManagerRole(requesterRole)

    if (!isManager) {
      // EMPLOYEE: セッションの employeeId が自分かつ visibility=BOTH のみ
      const session = await this.delegates.oneOnOneSession.findUnique({
        where: { id: sessionId },
      })
      if (!session) return null
      if (session.employeeId !== requesterId) {
        throw new OneOnOneLogAccessDeniedError('このセッションへのアクセス権がありません')
      }
      const log = await this.delegates.oneOnOneLog.findFirst({
        where: { sessionId, visibility: 'BOTH' },
      })
      return log ? mapLogRow(log) : null
    }

    // MANAGER 以上: 全て表示
    const log = await this.delegates.oneOnOneLog.findFirst({
      where: { sessionId },
    })
    return log ? mapLogRow(log) : null
  }

  async getTimeline(
    employeeId: string,
    managerId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<OneOnOneTimelineEntry[]> {
    const isManager = isManagerRole(requesterRole)

    if (!isManager && requesterId !== employeeId) {
      throw new OneOnOneLogAccessDeniedError('自分のタイムラインのみ閲覧できます')
    }

    const sessions = await this.delegates.oneOnOneSession.findMany({
      where: { employeeId, managerId },
      include: {
        logs: isManager ? true : { where: { visibility: 'BOTH' } },
      } as unknown,
      orderBy: { scheduledAt: 'desc' } as unknown,
    })

    return sessions.map((session) => {
      const firstLog = session.logs[0]
      const log = firstLog !== undefined ? mapLogRow(firstLog) : null
      return {
        sessionId: session.id,
        scheduledAt: session.scheduledAt,
        durationMin: session.durationMin,
        log,
      }
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class OneOnOneLogNotFoundError extends Error {
  constructor(public readonly logId: string) {
    super(`OneOnOneLog not found: ${logId}`)
    this.name = 'OneOnOneLogNotFoundError'
  }
}

export class OneOnOneLogAccessDeniedError extends Error {
  constructor(public readonly reason: string) {
    super(`Access denied: ${reason}`)
    this.name = 'OneOnOneLogAccessDeniedError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createOneOnOneLogService(db?: PrismaClient): OneOnOneLogService {
  return new OneOnOneLogServiceImpl(db ?? new PrismaClient())
}
