/**
 * Issue #43 / Task 13.2: 個人目標登録と上長承認フロー — サービス (Req 6.3, 6.4, 6.5)
 *
 * 承認ステートマシン:
 *   DRAFT → PENDING_APPROVAL → APPROVED → IN_PROGRESS → COMPLETED
 *                           └→ REJECTED
 */
import type { PrismaClient } from '@prisma/client'
import type { NotificationEmitter } from '@/lib/notification/notification-emitter'
import type { NotificationEvent } from '@/lib/notification/notification-types'
import {
  PersonalGoalNotFoundError,
  PersonalGoalInvalidTransitionError,
  type GoalStatus,
  type PersonalGoalInput,
  type PersonalGoalRecord,
} from './personal-goal-types'

// ─────────────────────────────────────────────────────────────────────────────
// 許可された状態遷移マップ
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<GoalStatus, readonly GoalStatus[]> = {
  DRAFT: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS'],
  REJECTED: [],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonalGoalService {
  /** DRAFT で目標を作成 */
  createGoal(userId: string, input: PersonalGoalInput): Promise<PersonalGoalRecord>
  /** DRAFT → PENDING_APPROVAL、MANAGERに通知 */
  submitForApproval(goalId: string, requestedBy: string): Promise<PersonalGoalRecord>
  /** PENDING_APPROVAL → APPROVED、承認者IDを記録 */
  approveGoal(goalId: string, approvedBy: string): Promise<PersonalGoalRecord>
  /** PENDING_APPROVAL → REJECTED */
  rejectGoal(goalId: string, rejectedBy: string, reason: string): Promise<PersonalGoalRecord>
  /** APPROVED → IN_PROGRESS */
  startGoal(goalId: string): Promise<PersonalGoalRecord>
  /** IN_PROGRESS → COMPLETED */
  completeGoal(goalId: string): Promise<PersonalGoalRecord>
  /** 自分の目標一覧 */
  listMyGoals(userId: string): Promise<PersonalGoalRecord[]>
  /** 特定目標取得 */
  getGoal(goalId: string): Promise<PersonalGoalRecord | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository helper — Prisma の PersonalGoal を型安全に変換
// ─────────────────────────────────────────────────────────────────────────────

type PrismaPersonalGoal = {
  id: string
  userId: string
  parentOrgGoalId: string | null
  title: string
  description: string | null
  goalType: string
  keyResult: string | null
  targetValue: number | null
  unit: string | null
  status: string
  startDate: Date
  endDate: Date
  approvedBy: string | null
  approvedAt: Date | null
  rejectedAt: Date | null
  rejectedReason: string | null
  createdAt: Date
  updatedAt: Date
}

function toRecord(row: PrismaPersonalGoal): PersonalGoalRecord {
  return {
    id: row.id,
    userId: row.userId,
    parentOrgGoalId: row.parentOrgGoalId,
    title: row.title,
    description: row.description,
    goalType: row.goalType as PersonalGoalRecord['goalType'],
    keyResult: row.keyResult,
    targetValue: row.targetValue,
    unit: row.unit,
    status: row.status as GoalStatus,
    startDate: row.startDate,
    endDate: row.endDate,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    rejectedAt: row.rejectedAt,
    rejectedReason: row.rejectedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine helper
// ─────────────────────────────────────────────────────────────────────────────

function assertTransition(current: GoalStatus, next: GoalStatus): void {
  const allowed = ALLOWED_TRANSITIONS[current]
  if (!allowed.includes(next)) {
    throw new PersonalGoalInvalidTransitionError(current, next)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class PersonalGoalServiceImpl implements PersonalGoalService {
  constructor(
    private readonly db: PrismaClient,
    private readonly notificationEmitter: NotificationEmitter | null,
    private readonly clock: () => Date,
  ) {}

  async createGoal(userId: string, input: PersonalGoalInput): Promise<PersonalGoalRecord> {
    const row = await this.db.personalGoal.create({
      data: {
        userId,
        parentOrgGoalId: input.parentOrgGoalId ?? null,
        title: input.title,
        description: input.description ?? null,
        goalType: input.goalType,
        keyResult: input.keyResult ?? null,
        targetValue: input.targetValue ?? null,
        unit: input.unit ?? null,
        status: 'DRAFT',
        startDate: input.startDate,
        endDate: input.endDate,
      },
    })
    return toRecord(row)
  }

  async submitForApproval(goalId: string, requestedBy: string): Promise<PersonalGoalRecord> {
    const current = await this.db.personalGoal.findUnique({ where: { id: goalId } })
    if (!current) throw new PersonalGoalNotFoundError(goalId)

    assertTransition(current.status as GoalStatus, 'PENDING_APPROVAL')

    const updated = await this.db.personalGoal.update({
      where: { id: goalId },
      data: { status: 'PENDING_APPROVAL' },
    })

    await this.emitApprovalRequest(requestedBy, goalId, updated.title)

    return toRecord(updated)
  }

  async approveGoal(goalId: string, approvedBy: string): Promise<PersonalGoalRecord> {
    const current = await this.db.personalGoal.findUnique({ where: { id: goalId } })
    if (!current) throw new PersonalGoalNotFoundError(goalId)

    assertTransition(current.status as GoalStatus, 'APPROVED')

    const now = this.clock()
    const updated = await this.db.personalGoal.update({
      where: { id: goalId },
      data: { status: 'APPROVED', approvedBy, approvedAt: now },
    })
    return toRecord(updated)
  }

  async rejectGoal(
    goalId: string,
    rejectedBy: string,
    reason: string,
  ): Promise<PersonalGoalRecord> {
    const current = await this.db.personalGoal.findUnique({ where: { id: goalId } })
    if (!current) throw new PersonalGoalNotFoundError(goalId)

    assertTransition(current.status as GoalStatus, 'REJECTED')

    const now = this.clock()
    const updated = await this.db.personalGoal.update({
      where: { id: goalId },
      data: {
        status: 'REJECTED',
        rejectedAt: now,
        rejectedReason: reason,
        approvedBy: rejectedBy,
      },
    })
    return toRecord(updated)
  }

  async startGoal(goalId: string): Promise<PersonalGoalRecord> {
    const current = await this.db.personalGoal.findUnique({ where: { id: goalId } })
    if (!current) throw new PersonalGoalNotFoundError(goalId)

    assertTransition(current.status as GoalStatus, 'IN_PROGRESS')

    const updated = await this.db.personalGoal.update({
      where: { id: goalId },
      data: { status: 'IN_PROGRESS' },
    })
    return toRecord(updated)
  }

  async completeGoal(goalId: string): Promise<PersonalGoalRecord> {
    const current = await this.db.personalGoal.findUnique({ where: { id: goalId } })
    if (!current) throw new PersonalGoalNotFoundError(goalId)

    assertTransition(current.status as GoalStatus, 'COMPLETED')

    const updated = await this.db.personalGoal.update({
      where: { id: goalId },
      data: { status: 'COMPLETED' },
    })
    return toRecord(updated)
  }

  async listMyGoals(userId: string): Promise<PersonalGoalRecord[]> {
    const rows = await this.db.personalGoal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toRecord)
  }

  async getGoal(goalId: string): Promise<PersonalGoalRecord | null> {
    const row = await this.db.personalGoal.findUnique({ where: { id: goalId } })
    return row ? toRecord(row) : null
  }

  // ─── private ──────────────────────────────────────────────────────────────

  private async emitApprovalRequest(
    requestedBy: string,
    goalId: string,
    goalTitle: string,
  ): Promise<void> {
    if (!this.notificationEmitter) return
    const event: NotificationEvent = {
      userId: requestedBy,
      category: 'GOAL_APPROVAL_REQUEST',
      title: '目標の承認依頼',
      body: `「${goalTitle}」の承認をお願いします。`,
      payload: { goalId },
    }
    try {
      await this.notificationEmitter.emit(event)
    } catch {
      // 通知サービスが未初期化または失敗した場合は無視
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPersonalGoalService(
  db: PrismaClient,
  notificationEmitter: NotificationEmitter | null = null,
  clock: () => Date = () => new Date(),
): PersonalGoalService {
  return new PersonalGoalServiceImpl(db, notificationEmitter, clock)
}
