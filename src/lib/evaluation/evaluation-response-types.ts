/**
 * Issue #53 / Task 15.4: 自己評価とピア評価の受付
 * (Requirement 8.5, 8.6, 8.7, 8.17)
 *
 * - EvaluationResponseType: SELF / TOP_DOWN / PEER
 * - EvaluationResponseRecord: ドメインレコード型
 * - evaluationResponseInputSchema: 入力バリデーション (Zod)
 * - ドメインエラークラス
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EvaluationResponseType = 'SELF' | 'TOP_DOWN' | 'PEER'

export interface EvaluationResponseRecord {
  id: string
  cycleId: string
  evaluatorId: string
  targetUserId: string
  responseType: EvaluationResponseType
  score: number
  comment: string | null
  submittedAt: Date
  isDraft: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema
// ─────────────────────────────────────────────────────────────────────────────

export const evaluationResponseInputSchema = z.object({
  cycleId: z.string().min(1),
  targetUserId: z.string().min(1),
  responseType: z.enum(['SELF', 'TOP_DOWN', 'PEER']),
  score: z.number().int().min(0).max(100),
  comment: z.string().max(2000).optional(),
})

export type EvaluationResponseInput = z.infer<typeof evaluationResponseInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class EvaluationResponseNotFoundError extends Error {
  constructor() {
    super('EvaluationResponse not found')
    this.name = 'EvaluationResponseNotFoundError'
  }
}

export class EvaluationAlreadySubmittedError extends Error {
  constructor() {
    super('Evaluation has already been submitted')
    this.name = 'EvaluationAlreadySubmittedError'
  }
}

export class EvaluationNotAssignedError extends Error {
  constructor() {
    super('No active assignment found for this evaluator and target')
    this.name = 'EvaluationNotAssignedError'
  }
}
