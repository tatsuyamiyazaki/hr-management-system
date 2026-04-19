/**
 * Issue #52 / Task 15.3: 評価対象者選択・辞退・代替評価者 サービス
 * (Req 8.3, 8.4, 8.10, 8.11, 8.12)
 *
 * - addAssignment: 評価対象を追加（maxTargets 上限チェック含む）
 * - listByEvaluator: 評価者の割り当て一覧を取得
 * - listByTarget: 対象者への割り当て一覧を取得（HR_MANAGER 向け）
 * - listByCycle: サイクル全体の割り当て一覧（HR_MANAGER 向け）
 * - declineAssignment: 辞退登録（status を DECLINED に変更、ReviewDecline を作成）
 * - assignReplacement: 代替評価者を割り当て（新規 ReviewAssignment を作成し、元を REPLACED に変更）
 */
import type { PrismaClient } from '@prisma/client'
import {
  AssignmentNotFoundError,
  AssignmentNotActiveError,
  MaxTargetsExceededError,
  DuplicateAssignmentError,
  type AddAssignmentInput,
  type DeclineAssignmentInput,
  type AssignmentStatus,
  type ReviewAssignmentRecord,
  type ReviewDeclineRecord,
} from './review-assignment-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewAssignmentService {
  /** 評価対象を追加（maxTargets 上限チェック含む） */
  addAssignment(input: AddAssignmentInput): Promise<ReviewAssignmentRecord>
  /** 評価者の割り当て一覧を取得 */
  listByEvaluator(cycleId: string, evaluatorId: string): Promise<ReviewAssignmentRecord[]>
  /** 対象者への割り当て一覧を取得（HR_MANAGER 向け） */
  listByTarget(cycleId: string, targetUserId: string): Promise<ReviewAssignmentRecord[]>
  /** サイクル全体の割り当て一覧（HR_MANAGER 向け） */
  listByCycle(cycleId: string): Promise<ReviewAssignmentRecord[]>
  /** 辞退登録（status を DECLINED に変更、ReviewDecline を作成） */
  declineAssignment(
    assignmentId: string,
    declinedBy: string,
    input: DeclineAssignmentInput,
  ): Promise<ReviewAssignmentRecord>
  /** 代替評価者を割り当て（新規 ReviewAssignment を作成し、元を REPLACED に変更） */
  assignReplacement(
    assignmentId: string,
    replacementEvaluatorId: string,
  ): Promise<ReviewAssignmentRecord>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row → domain record conversion
// ─────────────────────────────────────────────────────────────────────────────

type PrismaDeclineRow = {
  id: string
  assignmentId: string
  reason: string
  replacementEvaluatorId: string | null
  declinedAt: Date
}

type PrismaAssignmentRow = {
  id: string
  cycleId: string
  evaluatorId: string
  targetUserId: string
  status: string
  createdAt: Date
  updatedAt: Date
  decline: PrismaDeclineRow | null
}

function toDeclineRecord(row: PrismaDeclineRow): ReviewDeclineRecord {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    reason: row.reason,
    replacementEvaluatorId: row.replacementEvaluatorId,
    declinedAt: row.declinedAt,
  }
}

function toRecord(row: PrismaAssignmentRow): ReviewAssignmentRecord {
  return {
    id: row.id,
    cycleId: row.cycleId,
    evaluatorId: row.evaluatorId,
    targetUserId: row.targetUserId,
    status: row.status as AssignmentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.decline ? { decline: toDeclineRecord(row.decline) } : {}),
  }
}

const WITH_DECLINE = { decline: true } as const

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class ReviewAssignmentServiceImpl implements ReviewAssignmentService {
  constructor(private readonly db: PrismaClient) {}

  async addAssignment(input: AddAssignmentInput): Promise<ReviewAssignmentRecord> {
    const { cycleId, evaluatorId, targetUserId } = input

    const cycle = await this.db.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { maxTargets: true },
    })
    if (!cycle) {
      throw new Error(`ReviewCycle not found: ${cycleId}`)
    }

    // maxTargets 上限チェック: ACTIVE な割り当て数が上限以上であればエラー
    const activeCount = await this.db.reviewAssignment.count({
      where: { cycleId, evaluatorId, status: 'ACTIVE' },
    })
    if (activeCount >= cycle.maxTargets) {
      throw new MaxTargetsExceededError(cycle.maxTargets)
    }

    // 重複チェック
    const existing = await this.db.reviewAssignment.findUnique({
      where: { cycleId_evaluatorId_targetUserId: { cycleId, evaluatorId, targetUserId } },
    })
    if (existing) {
      throw new DuplicateAssignmentError()
    }

    const row = await this.db.reviewAssignment.create({
      data: { cycleId, evaluatorId, targetUserId, status: 'ACTIVE' },
      include: WITH_DECLINE,
    })
    return toRecord(row)
  }

  async listByEvaluator(cycleId: string, evaluatorId: string): Promise<ReviewAssignmentRecord[]> {
    const rows = await this.db.reviewAssignment.findMany({
      where: { cycleId, evaluatorId },
      include: WITH_DECLINE,
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async listByTarget(cycleId: string, targetUserId: string): Promise<ReviewAssignmentRecord[]> {
    const rows = await this.db.reviewAssignment.findMany({
      where: { cycleId, targetUserId },
      include: WITH_DECLINE,
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async listByCycle(cycleId: string): Promise<ReviewAssignmentRecord[]> {
    const rows = await this.db.reviewAssignment.findMany({
      where: { cycleId },
      include: WITH_DECLINE,
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async declineAssignment(
    assignmentId: string,
    _declinedBy: string,
    input: DeclineAssignmentInput,
  ): Promise<ReviewAssignmentRecord> {
    const current = await this.db.reviewAssignment.findUnique({
      where: { id: assignmentId },
      include: WITH_DECLINE,
    })
    if (!current) throw new AssignmentNotFoundError(assignmentId)
    if (current.status !== 'ACTIVE') {
      throw new AssignmentNotActiveError(assignmentId, current.status as AssignmentStatus)
    }

    const updated = await this.db.reviewAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'DECLINED',
        decline: {
          create: {
            reason: input.reason,
            replacementEvaluatorId: input.replacementEvaluatorId ?? null,
          },
        },
      },
      include: WITH_DECLINE,
    })
    return toRecord(updated)
  }

  async assignReplacement(
    assignmentId: string,
    replacementEvaluatorId: string,
  ): Promise<ReviewAssignmentRecord> {
    const original = await this.db.reviewAssignment.findUnique({
      where: { id: assignmentId },
      include: WITH_DECLINE,
    })
    if (!original) throw new AssignmentNotFoundError(assignmentId)
    if (original.status !== 'ACTIVE') {
      throw new AssignmentNotActiveError(assignmentId, original.status as AssignmentStatus)
    }

    const { cycleId, targetUserId } = original

    // 代替評価者も maxTargets チェック
    const cycle = await this.db.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { maxTargets: true },
    })
    if (!cycle) {
      throw new Error(`ReviewCycle not found: ${cycleId}`)
    }

    const replacementActiveCount = await this.db.reviewAssignment.count({
      where: { cycleId, evaluatorId: replacementEvaluatorId, status: 'ACTIVE' },
    })
    if (replacementActiveCount >= cycle.maxTargets) {
      throw new MaxTargetsExceededError(cycle.maxTargets)
    }

    // トランザクション: 元を REPLACED に変更 + 代替評価者の新規割り当て作成
    const [, newAssignment] = await this.db.$transaction([
      this.db.reviewAssignment.update({
        where: { id: assignmentId },
        data: { status: 'REPLACED' },
      }),
      this.db.reviewAssignment.create({
        data: {
          cycleId,
          evaluatorId: replacementEvaluatorId,
          targetUserId,
          status: 'ACTIVE',
        },
        include: WITH_DECLINE,
      }),
    ])

    return toRecord(newAssignment)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createReviewAssignmentService(db: PrismaClient): ReviewAssignmentService {
  return new ReviewAssignmentServiceImpl(db)
}
