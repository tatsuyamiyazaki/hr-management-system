/**
 * Issue #55 / Task 17.1, 17.2: フィードバック変換ドメイン型定義
 *
 * - マイルド化変換ジョブのペイロード型
 * - FeedbackService インターフェース
 * - 変換結果の型
 * - FeedbackTransformResult エンティティ（永続化モデル）
 * - FeedbackResultRepository ポート
 *
 * 関連要件: Req 10.1, 10.2, 10.3, 10.5
 */
import { z } from 'zod'
import type { UserRole } from '@/lib/notification/notification-types'

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
  readonly summary: string
  readonly transformedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// FeedbackTransformResult エンティティ（永続化モデル）
// ─────────────────────────────────────────────────────────────────────────────

/** フィードバック変換のステータス */
export type FeedbackStatus =
  | 'TRANSFORMING'
  | 'PENDING_HR_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED'

/**
 * 変換前後の両データと要約を保持するエンティティ。
 * rawCommentBatch は HR_MANAGER 以上のみ参照可能（Req 10.5）。
 */
export interface FeedbackTransformResult {
  readonly id: string
  readonly cycleId: string
  readonly subjectId: string
  readonly rawCommentBatch: readonly string[]
  readonly transformedBatch: readonly string[]
  readonly summary: string
  readonly status: FeedbackStatus
  readonly approvedBy?: string
  readonly approvedAt?: string
  readonly publishedAt?: string
  readonly archivedAt?: string
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
// FeedbackResultRepository ポート（変換結果の永続化）
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackResultRepository {
  /** 変換結果を保存する */
  save(result: FeedbackTransformResult): Promise<void>
  /** cycleId + subjectId で変換結果を取得する */
  findByCycleAndSubject(cycleId: string, subjectId: string): Promise<FeedbackTransformResult | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// Access control（Req 10.5: 生データは HR_MANAGER 以上のみ参照可能）
// ─────────────────────────────────────────────────────────────────────────────

const HR_MANAGER_OR_ABOVE: readonly UserRole[] = ['HR_MANAGER', 'ADMIN']

/**
 * 指定ロールが生コメントデータを参照可能か判定する。
 * HR_MANAGER または ADMIN のみ true を返す。
 */
export function canAccessRawComments(role: UserRole): boolean {
  return (HR_MANAGER_OR_ABOVE as readonly string[]).includes(role)
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackService {
  /** サイクル完了時に被評価者単位の変換ジョブを BullMQ に投入する */
  scheduleTransform(cycleId: string): Promise<void>
}
