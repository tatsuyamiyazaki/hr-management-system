/**
 * Issue #55 / Task 17.1: フィードバック変換ドメイン型定義
 *
 * - マイルド化変換ジョブのペイロード型
 * - FeedbackService インターフェース
 * - 変換結果の型
 *
 * 関連要件: Req 10.1, 10.2
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Job payload schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * feedback-transform ジョブのペイロードスキーマ。
 * 被評価者単位で 1 ジョブとして投入する。
 */
export const feedbackTransformPayloadSchema = z.object({
  cycleId: z.string().min(1),
  subjectId: z.string().min(1),
})

export type FeedbackTransformPayload = z.infer<typeof feedbackTransformPayloadSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Transform result
// ─────────────────────────────────────────────────────────────────────────────

export interface TransformResult {
  readonly original: string
  readonly transformed: string
}

export interface FeedbackTransformJobResult {
  readonly cycleId: string
  readonly subjectId: string
  readonly results: readonly TransformResult[]
  readonly transformedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository port (被評価者一覧取得 + 生コメント取得)
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackRepository {
  /** サイクルに紐づく被評価者(subject)の一覧を返す */
  findSubjectsByCycleId(cycleId: string): Promise<string[]>
  /** 被評価者に対する生のフィードバックコメントを返す */
  findRawComments(cycleId: string, subjectId: string): Promise<string[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackService {
  /** サイクル完了時に被評価者単位の変換ジョブを BullMQ に投入する */
  scheduleTransform(cycleId: string): Promise<void>
}
