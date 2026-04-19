/**
 * Issue #53 / Task 15.4: 自己評価とピア評価の受付
 * (Requirement 8.5, 8.6, 8.7, 8.17)
 *
 * - saveDraft: 下書き保存または更新（isDraft: true）
 * - submit: 送信（isDraft: false）→ EvaluationSubmitted イベント発行
 *   - SELF の場合: ReviewAssignment チェック不要
 *   - TOP_DOWN / PEER: ACTIVE な ReviewAssignment があることを確認
 * - listMyResponses: 自分が提出した評価一覧
 * - listReceivedResponses: 自分が受けた評価一覧（送信済みのみ）
 * - listByCycle: HR_MANAGER 用サイクル全体の評価一覧
 */
import type { PrismaClient } from '@prisma/client'
import { getEvaluationEventBus } from './evaluation-event-bus-di'
import {
  EvaluationAlreadySubmittedError,
  EvaluationNotAssignedError,
  type EvaluationResponseInput,
  type EvaluationResponseRecord,
  type EvaluationResponseType,
} from './evaluation-response-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface EvaluationResponseService {
  /** 下書き保存または作成（isDraft: true） */
  saveDraft(evaluatorId: string, input: EvaluationResponseInput): Promise<EvaluationResponseRecord>

  /**
   * 送信（isDraft: false に更新）→ EvaluationSubmitted イベント発行
   * - SELF の場合: ReviewAssignment チェック不要
   * - TOP_DOWN / PEER の場合: ACTIVE な ReviewAssignment があることを確認
   */
  submit(evaluatorId: string, input: EvaluationResponseInput): Promise<EvaluationResponseRecord>

  /** 自分が提出した評価一覧 */
  listMyResponses(evaluatorId: string, cycleId: string): Promise<EvaluationResponseRecord[]>

  /** 自分が受けた評価一覧（送信済みのみ） */
  listReceivedResponses(targetUserId: string, cycleId: string): Promise<EvaluationResponseRecord[]>

  /** HR_MANAGER 用: サイクル全体の評価一覧 */
  listByCycle(cycleId: string): Promise<EvaluationResponseRecord[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row → domain record conversion
// ─────────────────────────────────────────────────────────────────────────────

type PrismaResponseRow = {
  id: string
  cycleId: string
  evaluatorId: string
  targetUserId: string
  responseType: string
  score: number
  comment: string | null
  submittedAt: Date
  isDraft: boolean
}

function toRecord(row: PrismaResponseRow): EvaluationResponseRecord {
  return {
    id: row.id,
    cycleId: row.cycleId,
    evaluatorId: row.evaluatorId,
    targetUserId: row.targetUserId,
    responseType: row.responseType as EvaluationResponseType,
    score: row.score,
    comment: row.comment,
    submittedAt: row.submittedAt,
    isDraft: row.isDraft,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class EvaluationResponseServiceImpl implements EvaluationResponseService {
  constructor(private readonly db: PrismaClient) {}

  async saveDraft(
    evaluatorId: string,
    input: EvaluationResponseInput,
  ): Promise<EvaluationResponseRecord> {
    const { cycleId, targetUserId, responseType, score, comment } = input

    const row = await this.db.evaluationResponse.upsert({
      where: {
        cycleId_evaluatorId_targetUserId_responseType: {
          cycleId,
          evaluatorId,
          targetUserId,
          responseType,
        },
      },
      create: {
        cycleId,
        evaluatorId,
        targetUserId,
        responseType,
        score,
        comment: comment ?? null,
        isDraft: true,
      },
      update: {
        score,
        comment: comment ?? null,
        isDraft: true,
      },
    })

    return toRecord(row)
  }

  async submit(
    evaluatorId: string,
    input: EvaluationResponseInput,
  ): Promise<EvaluationResponseRecord> {
    const { cycleId, targetUserId, responseType, score, comment } = input

    // 送信済みチェック
    const existing = await this.db.evaluationResponse.findUnique({
      where: {
        cycleId_evaluatorId_targetUserId_responseType: {
          cycleId,
          evaluatorId,
          targetUserId,
          responseType,
        },
      },
    })
    if (existing !== null && !existing.isDraft) {
      throw new EvaluationAlreadySubmittedError()
    }

    // TOP_DOWN / PEER の場合: ACTIVE な ReviewAssignment があることを確認
    if (responseType !== 'SELF') {
      const assignment = await this.db.reviewAssignment.findFirst({
        where: {
          cycleId,
          evaluatorId,
          targetUserId,
          status: 'ACTIVE',
        },
      })
      if (!assignment) {
        throw new EvaluationNotAssignedError()
      }
    }

    const now = new Date()
    const row = await this.db.evaluationResponse.upsert({
      where: {
        cycleId_evaluatorId_targetUserId_responseType: {
          cycleId,
          evaluatorId,
          targetUserId,
          responseType,
        },
      },
      create: {
        cycleId,
        evaluatorId,
        targetUserId,
        responseType,
        score,
        comment: comment ?? null,
        isDraft: false,
        submittedAt: now,
      },
      update: {
        score,
        comment: comment ?? null,
        isDraft: false,
        submittedAt: now,
      },
    })

    // EvaluationSubmitted イベント発行
    try {
      const bus = getEvaluationEventBus()
      await bus.publish('EvaluationSubmitted', {
        evaluationId: row.id,
        evaluatorId,
        targetUserId,
        submittedAt: now.toISOString(),
      })
    } catch {
      // バスが未初期化の場合は無視
    }

    return toRecord(row)
  }

  async listMyResponses(evaluatorId: string, cycleId: string): Promise<EvaluationResponseRecord[]> {
    const rows = await this.db.evaluationResponse.findMany({
      where: { cycleId, evaluatorId },
      orderBy: { submittedAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async listReceivedResponses(
    targetUserId: string,
    cycleId: string,
  ): Promise<EvaluationResponseRecord[]> {
    const rows = await this.db.evaluationResponse.findMany({
      where: { cycleId, targetUserId, isDraft: false },
      orderBy: { submittedAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async listByCycle(cycleId: string): Promise<EvaluationResponseRecord[]> {
    const rows = await this.db.evaluationResponse.findMany({
      where: { cycleId },
      orderBy: { submittedAt: 'asc' },
    })
    return rows.map(toRecord)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createEvaluationResponseService(db: PrismaClient): EvaluationResponseService {
  return new EvaluationResponseServiceImpl(db)
}
