/**
 * Issue #47 / Task 14.1: 1on1 予定登録と通知 — サービス (Req 7.1, 7.2)
 *
 * - MANAGER が予定日時・所要時間・アジェンダを登録
 * - 対象部下（employeeId）に ONE_ON_ONE_REMINDER 通知を送信
 */
import type { PrismaClient } from '@prisma/client'
import type { NotificationEmitter } from '@/lib/notification/notification-emitter'
import {
  OneOnOneSessionNotFoundError,
  OneOnOneSessionAccessDeniedError,
  type OneOnOneSessionInput,
  type OneOnOneSessionRecord,
} from './one-on-one-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface OneOnOneSessionService {
  /** MANAGER が予定を登録し、部下に通知 (Req 7.1, 7.2) */
  createSession(managerId: string, input: OneOnOneSessionInput): Promise<OneOnOneSessionRecord>
  /** 自分が関わるセッション一覧 (MANAGER: 自分設定, EMPLOYEE: 自分向け) */
  listMySessions(userId: string, role: string): Promise<OneOnOneSessionRecord[]>
  /** セッション詳細取得 */
  getSession(sessionId: string): Promise<OneOnOneSessionRecord | null>
  /** 予定更新（MANAGER のみ） */
  updateSession(
    sessionId: string,
    managerId: string,
    input: Partial<OneOnOneSessionInput>,
  ): Promise<OneOnOneSessionRecord>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row → domain record mapper
// ─────────────────────────────────────────────────────────────────────────────

type PrismaOneOnOneSession = {
  id: string
  managerId: string
  employeeId: string
  scheduledAt: Date
  durationMin: number
  agenda: string | null
  createdAt: Date
  updatedAt: Date
}

function toRecord(row: PrismaOneOnOneSession): OneOnOneSessionRecord {
  return {
    id: row.id,
    managerId: row.managerId,
    employeeId: row.employeeId,
    scheduledAt: row.scheduledAt,
    durationMin: row.durationMin,
    agenda: row.agenda,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

const MANAGER_ROLES = ['MANAGER', 'HR_MANAGER', 'ADMIN'] as const

class OneOnOneSessionServiceImpl implements OneOnOneSessionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly notificationEmitter: NotificationEmitter | null,
  ) {}

  async createSession(
    managerId: string,
    input: OneOnOneSessionInput,
  ): Promise<OneOnOneSessionRecord> {
    const row = await this.db.oneOnOneSession.create({
      data: {
        managerId,
        employeeId: input.employeeId,
        scheduledAt: input.scheduledAt,
        durationMin: input.durationMin,
        agenda: input.agenda ?? null,
      },
    })

    // 部下への予定通知 (Req 7.2)
    if (this.notificationEmitter) {
      try {
        await this.notificationEmitter.emit({
          userId: input.employeeId,
          category: 'ONE_ON_ONE_REMINDER',
          title: '1on1 予定が登録されました',
          body: `${row.scheduledAt.toISOString()} に 1on1 が設定されました。所要時間: ${row.durationMin} 分`,
          payload: { sessionId: row.id, managerId, scheduledAt: row.scheduledAt.toISOString() },
        })
      } catch {
        // 通知失敗はセッション作成の成功に影響しない
      }
    }

    return toRecord(row)
  }

  async listMySessions(userId: string, role: string): Promise<OneOnOneSessionRecord[]> {
    const isManager = (MANAGER_ROLES as readonly string[]).includes(role)

    const rows = await this.db.oneOnOneSession.findMany({
      where: isManager ? { managerId: userId } : { employeeId: userId },
      orderBy: { scheduledAt: 'asc' },
    })

    return rows.map(toRecord)
  }

  async getSession(sessionId: string): Promise<OneOnOneSessionRecord | null> {
    const row = await this.db.oneOnOneSession.findUnique({ where: { id: sessionId } })
    return row ? toRecord(row) : null
  }

  async updateSession(
    sessionId: string,
    managerId: string,
    input: Partial<OneOnOneSessionInput>,
  ): Promise<OneOnOneSessionRecord> {
    const existing = await this.db.oneOnOneSession.findUnique({ where: { id: sessionId } })
    if (!existing) {
      throw new OneOnOneSessionNotFoundError(sessionId)
    }
    if (existing.managerId !== managerId) {
      throw new OneOnOneSessionAccessDeniedError(
        'Only the manager who created the session can update it',
      )
    }

    const row = await this.db.oneOnOneSession.update({
      where: { id: sessionId },
      data: {
        ...(input.scheduledAt !== undefined && { scheduledAt: input.scheduledAt }),
        ...(input.durationMin !== undefined && { durationMin: input.durationMin }),
        ...(input.agenda !== undefined && { agenda: input.agenda }),
      },
    })

    return toRecord(row)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createOneOnOneSessionService(
  db: PrismaClient,
  notificationEmitter: NotificationEmitter | null,
): OneOnOneSessionService {
  return new OneOnOneSessionServiceImpl(db, notificationEmitter)
}
