/**
 * Issue #55 / Task 15.6: 進捗表示とリマインダー サービス
 * (Req 8.8, 8.9)
 *
 * - getCycleProgress: HR_MANAGER向け — サイクル全体の評価進捗を集計
 * - getEvaluatorProgress: 個人向け — 自分の評価進捗を取得
 * - scanAndSendReminders: 締切3日前のACTIVEサイクルの未提出者に通知
 */
import type { PrismaClient } from '@prisma/client'
import type { NotificationEmitter } from '@/lib/notification/notification-emitter'
import {
  EvaluationProgressCycleNotFoundError,
  type CycleProgressRecord,
  type EvaluatorProgressRecord,
  type ReminderScanResult,
} from './evaluation-progress-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface EvaluationProgressService {
  /** HR_MANAGER向け: サイクル全体の評価進捗を集計 */
  getCycleProgress(cycleId: string): Promise<CycleProgressRecord>
  /** 個人向け: 自分の評価進捗を取得 */
  getEvaluatorProgress(cycleId: string, evaluatorId: string): Promise<EvaluatorProgressRecord>
  /** 締切3日前のACTIVEサイクルの未提出者に通知を送る */
  scanAndSendReminders(now: Date): Promise<ReminderScanResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

const REMINDER_DAYS_BEFORE = 3

class EvaluationProgressServiceImpl implements EvaluationProgressService {
  constructor(
    private readonly db: PrismaClient,
    private readonly notificationEmitter: NotificationEmitter | null,
  ) {}

  async getCycleProgress(cycleId: string): Promise<CycleProgressRecord> {
    const cycle = await this.db.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { id: true },
    })
    if (!cycle) throw new EvaluationProgressCycleNotFoundError(cycleId)

    const assignments = await this.db.reviewAssignment.findMany({
      where: { cycleId, status: 'ACTIVE' },
      select: { evaluatorId: true, targetUserId: true },
    })

    const submitted = await this.db.evaluationResponse.findMany({
      where: { cycleId, isDraft: false },
      select: { evaluatorId: true, targetUserId: true },
    })

    const submittedSet = new Set(submitted.map((r) => `${r.evaluatorId}::${r.targetUserId}`))

    const progressMap = new Map<string, { total: number; submittedCount: number }>()
    for (const a of assignments) {
      const entry = progressMap.get(a.evaluatorId) ?? { total: 0, submittedCount: 0 }
      entry.total += 1
      if (submittedSet.has(`${a.evaluatorId}::${a.targetUserId}`)) {
        entry.submittedCount += 1
      }
      progressMap.set(a.evaluatorId, entry)
    }

    const evaluators: EvaluatorProgressRecord[] = Array.from(progressMap.entries()).map(
      ([evaluatorId, { total, submittedCount }]) => ({
        evaluatorId,
        totalAssignments: total,
        submittedCount,
        pendingCount: total - submittedCount,
      }),
    )

    return {
      cycleId,
      totalEvaluators: evaluators.length,
      fullySubmittedCount: evaluators.filter((e) => e.pendingCount === 0).length,
      evaluators,
    }
  }

  async getEvaluatorProgress(
    cycleId: string,
    evaluatorId: string,
  ): Promise<EvaluatorProgressRecord> {
    const cycle = await this.db.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { id: true },
    })
    if (!cycle) throw new EvaluationProgressCycleNotFoundError(cycleId)

    const assignments = await this.db.reviewAssignment.findMany({
      where: { cycleId, evaluatorId, status: 'ACTIVE' },
      select: { targetUserId: true },
    })

    const totalAssignments = assignments.length

    const submittedResponses = await this.db.evaluationResponse.findMany({
      where: {
        cycleId,
        evaluatorId,
        isDraft: false,
        targetUserId: { in: assignments.map((a) => a.targetUserId) },
      },
      select: { targetUserId: true },
    })

    const submittedCount = submittedResponses.length

    return {
      evaluatorId,
      totalAssignments,
      submittedCount,
      pendingCount: totalAssignments - submittedCount,
    }
  }

  async scanAndSendReminders(now: Date): Promise<ReminderScanResult> {
    const deadlineThreshold = new Date(now)
    deadlineThreshold.setDate(deadlineThreshold.getDate() + REMINDER_DAYS_BEFORE)

    const activeCycles = await this.db.reviewCycle.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: now, lte: deadlineThreshold },
      },
      select: { id: true, name: true },
    })

    let notified = 0
    let skipped = 0

    for (const cycle of activeCycles) {
      const assignments = await this.db.reviewAssignment.findMany({
        where: { cycleId: cycle.id, status: 'ACTIVE' },
        select: { evaluatorId: true, targetUserId: true },
      })

      const submitted = await this.db.evaluationResponse.findMany({
        where: { cycleId: cycle.id, isDraft: false },
        select: { evaluatorId: true, targetUserId: true },
      })

      const submittedSet = new Set(submitted.map((r) => `${r.evaluatorId}::${r.targetUserId}`))

      const pendingEvaluatorIds = new Set<string>()
      for (const a of assignments) {
        if (!submittedSet.has(`${a.evaluatorId}::${a.targetUserId}`)) {
          pendingEvaluatorIds.add(a.evaluatorId)
        }
      }

      for (const evaluatorId of pendingEvaluatorIds) {
        if (!this.notificationEmitter) {
          skipped++
          continue
        }
        try {
          await this.notificationEmitter.emit({
            userId: evaluatorId,
            category: 'EVAL_REMINDER',
            title: '評価の締め切りが近づいています',
            body: `「${cycle.name}」の評価締め切りまであと${REMINDER_DAYS_BEFORE}日です。未提出の評価を完了してください。`,
            payload: { cycleId: cycle.id },
          })
          notified++
        } catch {
          skipped++
        }
      }
    }

    return { notified, skipped }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createEvaluationProgressService(
  db: PrismaClient,
  notificationEmitter: NotificationEmitter | null = null,
): EvaluationProgressService {
  return new EvaluationProgressServiceImpl(db, notificationEmitter)
}
