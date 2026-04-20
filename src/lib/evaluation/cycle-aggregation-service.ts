/**
 * Issue #56 / Task 15.7: サイクル途中の入退社扱いと集計 サービス
 * (Req 8.13, 8.14, 8.15, 8.18, 8.19)
 *
 * - aggregateCycle: 全回答を集計してスコアと匿名コメントを生成 (Req 8.13, 8.14, 8.15)
 * - checkEligibility: 在籍期間50%未満の入社者を除外チェック (Req 8.18)
 * - invalidateResignedAssignments: 退職日以降の評価依頼を無効化 (Req 8.19)
 */
import type { PrismaClient } from '@prisma/client'
import {
  CycleAggregationNotFoundError,
  CycleAggregationInvalidStatusError,
  type AggregatedUserResult,
  type CycleAggregationResult,
  type EligibilityCheckResult,
  type InvalidateResignedResult,
} from './cycle-aggregation-types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_TENURE_RATIO = 0.5

const AGGREGATABLE_STATUSES = ['AGGREGATING', 'PENDING_FEEDBACK_APPROVAL', 'FINALIZED'] as const

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface CycleAggregationService {
  /**
   * 全回答を集計してスコアと匿名コメントを生成 (Req 8.13, 8.14, 8.15)
   * - peerScore = Σpeer_scores / peer_evaluator_count
   * - peerEvaluatorCount < minReviewers → minimumNotMet = true
   */
  aggregateCycle(cycleId: string): Promise<CycleAggregationResult>

  /**
   * 在籍期間チェック (Req 8.18)
   * hireDate が設定されており在籍期間がサイクル期間の50%未満の場合は除外対象
   */
  checkEligibility(cycleId: string, userIds: string[]): Promise<EligibilityCheckResult[]>

  /**
   * 退職日以降の評価依頼を無効化 (Req 8.19)
   * resignDate が設定されている target の ACTIVE な割り当てを DECLINED に変更
   */
  invalidateResignedAssignments(cycleId: string): Promise<InvalidateResignedResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class CycleAggregationServiceImpl implements CycleAggregationService {
  constructor(private readonly db: PrismaClient) {}

  async aggregateCycle(cycleId: string): Promise<CycleAggregationResult> {
    const cycle = await this.db.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, status: true, minReviewers: true },
    })
    if (!cycle) throw new CycleAggregationNotFoundError(cycleId)

    if (!AGGREGATABLE_STATUSES.includes(cycle.status as (typeof AGGREGATABLE_STATUSES)[number])) {
      throw new CycleAggregationInvalidStatusError(cycle.status)
    }

    const responses = await this.db.evaluationResponse.findMany({
      where: { cycleId, isDraft: false },
      select: {
        targetUserId: true,
        responseType: true,
        score: true,
        comment: true,
      },
    })

    const targetMap = new Map<
      string,
      {
        peerScores: number[]
        selfScore: number | null
        topDownScore: number | null
        comments: string[]
      }
    >()

    for (const r of responses) {
      if (!targetMap.has(r.targetUserId)) {
        targetMap.set(r.targetUserId, {
          peerScores: [],
          selfScore: null,
          topDownScore: null,
          comments: [],
        })
      }
      const entry = targetMap.get(r.targetUserId)!

      if (r.comment && r.responseType !== 'SELF') {
        entry.comments.push(r.comment)
      }

      if (r.responseType === 'PEER') {
        entry.peerScores.push(r.score)
      } else if (r.responseType === 'SELF') {
        entry.selfScore = r.score
      } else if (r.responseType === 'TOP_DOWN') {
        entry.topDownScore = r.score
      }
    }

    const results: AggregatedUserResult[] = Array.from(targetMap.entries()).map(
      ([targetUserId, { peerScores, selfScore, topDownScore, comments }]) => {
        const peerEvaluatorCount = peerScores.length
        const peerScore =
          peerEvaluatorCount > 0
            ? peerScores.reduce((sum, s) => sum + s, 0) / peerEvaluatorCount
            : null

        return {
          targetUserId,
          peerScore,
          peerEvaluatorCount,
          selfScore,
          topDownScore,
          minimumNotMet: peerEvaluatorCount < cycle.minReviewers,
          anonymousComments: comments,
        }
      },
    )

    return {
      cycleId,
      totalTargets: results.length,
      minimumNotMetCount: results.filter((r) => r.minimumNotMet).length,
      results,
    }
  }

  async checkEligibility(cycleId: string, userIds: string[]): Promise<EligibilityCheckResult[]> {
    const cycle = await this.db.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { startDate: true, endDate: true },
    })
    if (!cycle) throw new CycleAggregationNotFoundError(cycleId)

    const cycleDurationMs = cycle.endDate.getTime() - cycle.startDate.getTime()
    if (cycleDurationMs <= 0) {
      return userIds.map((userId) => ({ userId, eligible: true, tenureRatio: null }))
    }

    const users = await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, hireDate: true },
    })

    const userMap = new Map(users.map((u) => [u.id, u]))

    return userIds.map((userId) => {
      const user = userMap.get(userId)
      if (!user?.hireDate) {
        return { userId, eligible: true, tenureRatio: null }
      }

      const hireDateMs = user.hireDate.getTime()
      const cycleStartMs = cycle.startDate.getTime()
      const cycleEndMs = cycle.endDate.getTime()

      if (hireDateMs <= cycleStartMs) {
        return { userId, eligible: true, tenureRatio: 1 }
      }
      if (hireDateMs >= cycleEndMs) {
        return { userId, eligible: false, tenureRatio: 0 }
      }

      const tenureRatio = (cycleEndMs - hireDateMs) / cycleDurationMs
      return { userId, eligible: tenureRatio >= MIN_TENURE_RATIO, tenureRatio }
    })
  }

  async invalidateResignedAssignments(cycleId: string): Promise<InvalidateResignedResult> {
    const cycle = await this.db.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { id: true },
    })
    if (!cycle) throw new CycleAggregationNotFoundError(cycleId)

    const assignments = await this.db.reviewAssignment.findMany({
      where: {
        cycleId,
        status: 'ACTIVE',
        target: { resignDate: { not: null } },
      },
      select: { id: true },
    })

    if (assignments.length === 0) return { invalidated: 0 }

    await this.db.$transaction(
      assignments.map(({ id }) =>
        this.db.reviewAssignment.update({
          where: { id },
          data: {
            status: 'DECLINED',
            decline: {
              create: {
                reason: '退職による自動無効化',
                replacementEvaluatorId: null,
              },
            },
          },
        }),
      ),
    )

    return { invalidated: assignments.length }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createCycleAggregationService(db: PrismaClient): CycleAggregationService {
  return new CycleAggregationServiceImpl(db)
}
