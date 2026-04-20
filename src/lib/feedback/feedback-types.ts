/**
 * Issue #55 / Task 17.1, 17.2, 17.3: フィードバック変換ドメイン型定義
 * Issue #63 / Task 17.4: 閲覧確認と公開後アーカイブ
 *
 * - マイルド化変換ジョブのペイロード型
 * - FeedbackService インターフェース
 * - 変換結果の型
 * - FeedbackTransformResult エンティティ（永続化モデル）
 * - FeedbackResultRepository ポート
 * - FeedbackPreview / PublishedFeedback DTO（Req 10.4, 10.6）
 *
 * 関連要件: Req 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9
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
  readonly viewedAt?: string
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
  /** cycleId に紐づく全変換結果を取得する */
  findByCycleId(cycleId: string): Promise<FeedbackTransformResult[]>
  /** subjectId に紐づく公開済みフィードバックを取得する */
  findPublishedBySubject(subjectId: string): Promise<FeedbackTransformResult[]>
  /** publishedAt が指定日時より前の PUBLISHED フィードバックを取得する（アーカイブ候補） */
  findPublishedBefore(publishedBefore: string): Promise<FeedbackTransformResult[]>
  /** ステータスを更新する */
  updateStatus(
    cycleId: string,
    subjectId: string,
    update: Partial<
      Pick<
        FeedbackTransformResult,
        'status' | 'approvedBy' | 'approvedAt' | 'publishedAt' | 'viewedAt' | 'archivedAt'
      >
    >,
  ): Promise<void>
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

/**
 * HR_MANAGER 向けプレビュー DTO（Req 10.4）。
 * 承認前に変換後コメントと要約を確認するために使用。
 */
export interface FeedbackPreview {
  readonly cycleId: string
  readonly subjectId: string
  readonly transformedBatch: readonly string[]
  readonly summary: string
  readonly status: FeedbackStatus
}

/**
 * 被評価者向け公開フィードバック DTO（Req 10.6）。
 * evaluatorId は型レベルで排除（匿名性保証）。
 */
export interface PublishedFeedback {
  readonly id: string
  readonly cycleId: string
  readonly subjectId: string
  readonly transformedBatch: readonly string[]
  readonly summary: string
  readonly publishedAt: string
}

/** PublishedFeedback の Zod スキーマ（余計なフィールド禁止） */
export const publishedFeedbackSchema = z
  .object({
    id: z.string(),
    cycleId: z.string(),
    subjectId: z.string(),
    transformedBatch: z.array(z.string()),
    summary: z.string(),
    publishedAt: z.string(),
  })
  .strict()

export interface FeedbackService {
  /** サイクル完了時に被評価者単位の変換ジョブを BullMQ に投入する */
  scheduleTransform(cycleId: string): Promise<void>
  /** HR_MANAGER 向け変換後プレビュー取得（Req 10.4） */
  previewTransformed(cycleId: string, subjectId: string): Promise<FeedbackPreview | null>
  /** HR_MANAGER が承認し公開する（Req 10.4, 10.6） */
  approveAndPublish(cycleId: string, subjectId: string, approvedBy: string): Promise<void>
  /** 被評価者向け公開済みフィードバック一覧取得（evaluatorId 除外）（Req 10.6） */
  getPublishedFor(subjectId: string): Promise<PublishedFeedback[]>
  /** 被評価者の確認日時を記録する（Req 10.7） */
  recordView(cycleId: string, subjectId: string): Promise<void>
  /** 公開から2年経過したフィードバックをアーカイブ化する（Req 10.9） */
  archiveExpired(now: Date): Promise<{ archived: number }>
}
