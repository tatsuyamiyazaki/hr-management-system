/**
 * Issue #51 / Task 15.2: 360度評価サイクル サービス (Req 8.1, 8.2)
 *
 * ステートマシン:
 *   DRAFT → ACTIVE → AGGREGATING → PENDING_FEEDBACK_APPROVAL → FINALIZED → CLOSED
 *
 * - activateCycle: 全アクティブ社員に EVAL_INVITATION 通知
 * - finalizeCycle: CycleFinalized イベントを EvaluationEventBus に publish
 */
import type { PrismaClient } from '@prisma/client'
import type { NotificationEmitter } from '@/lib/notification/notification-emitter'
import type { EvaluationEventBus } from './evaluation-event-bus'
import {
  ReviewCycleNotFoundError,
  ReviewCycleInvalidTransitionError,
  type ReviewCycleInput,
  type ReviewCycleRecord,
  type ReviewCycleStatus,
} from './review-cycle-types'

// ─────────────────────────────────────────────────────────────────────────────
// 許可された状態遷移マップ
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ReviewCycleStatus, readonly ReviewCycleStatus[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['AGGREGATING'],
  AGGREGATING: ['PENDING_FEEDBACK_APPROVAL'],
  PENDING_FEEDBACK_APPROVAL: ['FINALIZED'],
  FINALIZED: ['CLOSED'],
  CLOSED: [],
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewCycleService {
  /** DRAFT でサイクルを作成 */
  createCycle(createdBy: string, input: ReviewCycleInput): Promise<ReviewCycleRecord>
  /** DRAFT → ACTIVE: 全対象社員に EVAL_INVITATION 通知 */
  activateCycle(cycleId: string): Promise<ReviewCycleRecord>
  /** ACTIVE → AGGREGATING */
  startAggregating(cycleId: string): Promise<ReviewCycleRecord>
  /** AGGREGATING → PENDING_FEEDBACK_APPROVAL */
  pendingApproval(cycleId: string): Promise<ReviewCycleRecord>
  /** PENDING_FEEDBACK_APPROVAL → FINALIZED: CycleFinalized イベントを publish */
  finalizeCycle(cycleId: string): Promise<ReviewCycleRecord>
  /** FINALIZED → CLOSED */
  closeCycle(cycleId: string): Promise<ReviewCycleRecord>
  /** 一覧取得 */
  listCycles(filters?: { status?: ReviewCycleStatus }): Promise<ReviewCycleRecord[]>
  /** 個別取得 */
  getCycle(cycleId: string): Promise<ReviewCycleRecord | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository helper — Prisma の ReviewCycle を型安全に変換
// ─────────────────────────────────────────────────────────────────────────────

type PrismaReviewCycle = {
  id: string
  name: string
  status: string
  startDate: Date
  endDate: Date
  items: string[]
  incentiveK: number
  minReviewers: number
  maxTargets: number
  activatedAt: Date | null
  finalizedAt: Date | null
  closedAt: Date | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

function toRecord(row: PrismaReviewCycle): ReviewCycleRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ReviewCycleStatus,
    startDate: row.startDate,
    endDate: row.endDate,
    items: row.items,
    incentiveK: row.incentiveK,
    minReviewers: row.minReviewers,
    maxTargets: row.maxTargets,
    activatedAt: row.activatedAt,
    finalizedAt: row.finalizedAt,
    closedAt: row.closedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine helper
// ─────────────────────────────────────────────────────────────────────────────

function assertTransition(current: ReviewCycleStatus, next: ReviewCycleStatus): void {
  const allowed = ALLOWED_TRANSITIONS[current]
  if (!allowed.includes(next)) {
    throw new ReviewCycleInvalidTransitionError(current, next)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class ReviewCycleServiceImpl implements ReviewCycleService {
  constructor(
    private readonly db: PrismaClient,
    private readonly notificationEmitter: NotificationEmitter | null,
    private readonly eventBus: EvaluationEventBus | null,
    private readonly clock: () => Date,
  ) {}

  async createCycle(createdBy: string, input: ReviewCycleInput): Promise<ReviewCycleRecord> {
    const row = await this.db.reviewCycle.create({
      data: {
        name: input.name,
        status: 'DRAFT',
        startDate: input.startDate,
        endDate: input.endDate,
        items: input.items,
        incentiveK: input.incentiveK,
        minReviewers: input.minReviewers,
        maxTargets: input.maxTargets,
        createdBy,
      },
    })
    return toRecord(row)
  }

  async activateCycle(cycleId: string): Promise<ReviewCycleRecord> {
    const current = await this.db.reviewCycle.findUnique({ where: { id: cycleId } })
    if (!current) throw new ReviewCycleNotFoundError(cycleId)

    assertTransition(current.status as ReviewCycleStatus, 'ACTIVE')

    const now = this.clock()
    const updated = await this.db.reviewCycle.update({
      where: { id: cycleId },
      data: { status: 'ACTIVE', activatedAt: now },
    })

    await this.sendInvitationNotifications(updated.name, cycleId)

    return toRecord(updated)
  }

  async startAggregating(cycleId: string): Promise<ReviewCycleRecord> {
    const current = await this.db.reviewCycle.findUnique({ where: { id: cycleId } })
    if (!current) throw new ReviewCycleNotFoundError(cycleId)

    assertTransition(current.status as ReviewCycleStatus, 'AGGREGATING')

    const updated = await this.db.reviewCycle.update({
      where: { id: cycleId },
      data: { status: 'AGGREGATING' },
    })
    return toRecord(updated)
  }

  async pendingApproval(cycleId: string): Promise<ReviewCycleRecord> {
    const current = await this.db.reviewCycle.findUnique({ where: { id: cycleId } })
    if (!current) throw new ReviewCycleNotFoundError(cycleId)

    assertTransition(current.status as ReviewCycleStatus, 'PENDING_FEEDBACK_APPROVAL')

    const updated = await this.db.reviewCycle.update({
      where: { id: cycleId },
      data: { status: 'PENDING_FEEDBACK_APPROVAL' },
    })
    return toRecord(updated)
  }

  async finalizeCycle(cycleId: string): Promise<ReviewCycleRecord> {
    const current = await this.db.reviewCycle.findUnique({ where: { id: cycleId } })
    if (!current) throw new ReviewCycleNotFoundError(cycleId)

    assertTransition(current.status as ReviewCycleStatus, 'FINALIZED')

    const now = this.clock()
    const updated = await this.db.reviewCycle.update({
      where: { id: cycleId },
      data: { status: 'FINALIZED', finalizedAt: now },
    })

    await this.publishCycleFinalized(updated.id, updated.name, now)

    return toRecord(updated)
  }

  async closeCycle(cycleId: string): Promise<ReviewCycleRecord> {
    const current = await this.db.reviewCycle.findUnique({ where: { id: cycleId } })
    if (!current) throw new ReviewCycleNotFoundError(cycleId)

    assertTransition(current.status as ReviewCycleStatus, 'CLOSED')

    const now = this.clock()
    const updated = await this.db.reviewCycle.update({
      where: { id: cycleId },
      data: { status: 'CLOSED', closedAt: now },
    })
    return toRecord(updated)
  }

  async listCycles(filters?: { status?: ReviewCycleStatus }): Promise<ReviewCycleRecord[]> {
    const rows = await this.db.reviewCycle.findMany({
      where: filters?.status ? { status: filters.status } : {},
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toRecord)
  }

  async getCycle(cycleId: string): Promise<ReviewCycleRecord | null> {
    const row = await this.db.reviewCycle.findUnique({ where: { id: cycleId } })
    return row ? toRecord(row) : null
  }

  // ─── private ──────────────────────────────────────────────────────────────

  private async sendInvitationNotifications(cycleName: string, cycleId: string): Promise<void> {
    if (!this.notificationEmitter) return

    let activeUsers: { id: string }[] = []
    try {
      activeUsers = await this.db.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      })
    } catch {
      return
    }

    for (const user of activeUsers) {
      try {
        await this.notificationEmitter.emit({
          userId: user.id,
          category: 'EVAL_INVITATION',
          title: '360度評価が開始されました',
          body: `「${cycleName}」の360度評価が開始されました。評価を実施してください。`,
          payload: { cycleId },
        })
      } catch {
        // 個別通知の失敗は無視して継続
      }
    }
  }

  private async publishCycleFinalized(
    cycleId: string,
    cycleName: string,
    finalizedAt: Date,
  ): Promise<void> {
    if (!this.eventBus) return
    try {
      await this.eventBus.publish('CycleFinalized', {
        cycleId,
        cycleName,
        finalizedAt: finalizedAt.toISOString(),
      })
    } catch {
      // バスが未初期化または失敗した場合は無視
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createReviewCycleService(
  db: PrismaClient,
  notificationEmitter: NotificationEmitter | null = null,
  eventBus: EvaluationEventBus | null = null,
  clock: () => Date = () => new Date(),
): ReviewCycleService {
  return new ReviewCycleServiceImpl(db, notificationEmitter, eventBus, clock)
}
