/**
 * Issue #31 / Req 14.7, 14.8: 退職者データ匿名化・削除要求の型定義
 *
 * - AnonymizationSummary: 一括匿名化ジョブの実行結果
 * - DeletionPlan: 個人情報削除要求時の削除計画（削除可能/保持必要項目の識別）
 * - ドメイン例外: UserNotResignedError / UserAlreadyAnonymizedError
 */

// ─────────────────────────────────────────────────────────────────────────────
// 法定保持項目 / 削除可能項目の識別
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 法定保持期間中で削除不可の項目。
 * 監査ログ・評価統計データ等は 7 年間保持義務がある。
 */
export const RETENTION_FIELDS = [
  'userId',
  'hireDate',
  'resignDate',
  'role',
  'status',
  'createdAt',
  'updatedAt',
  'anonymizedAt',
] as const

/**
 * 削除可能な個人特定情報（PII）項目。
 * 匿名化時にクリアまたはプレースホルダに置換する。
 */
export const DELETABLE_FIELDS = [
  'email',
  'emailHash',
  'firstName',
  'lastName',
  'firstNameKana',
  'lastNameKana',
  'employeeCode',
  'employeeCodeHash',
  'phoneNumber',
  'avatarUrl',
  'selfIntro',
] as const

export type RetentionField = (typeof RETENTION_FIELDS)[number]
export type DeletableField = (typeof DELETABLE_FIELDS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// AnonymizationSummary
// ─────────────────────────────────────────────────────────────────────────────

/** 一括匿名化ジョブの実行結果 */
export interface AnonymizationSummary {
  /** 匿名化処理を実行した件数 */
  readonly processedCount: number
  /** スキップした件数（既に匿名化済み等） */
  readonly skippedCount: number
  /** 処理中にエラーとなったユーザー ID 一覧 */
  readonly errors: readonly AnonymizationError[]
}

/** 匿名化処理中のエラー詳細 */
export interface AnonymizationError {
  readonly userId: string
  readonly reason: string
}

// ─────────────────────────────────────────────────────────────────────────────
// DeletionPlan
// ─────────────────────────────────────────────────────────────────────────────

/** 削除要求時の削除計画 */
export interface DeletionPlan {
  readonly userId: string
  readonly requestedBy: string
  /** 削除可能項目一覧 */
  readonly deletableFields: readonly string[]
  /** 法定保持期間中で削除不可の項目一覧 */
  readonly retentionFields: readonly string[]
  /** 即時削除が可能か（7年経過済み or 削除要求受理済み） */
  readonly canExecuteImmediately: boolean
  /** 削除実行日時（実行済みの場合） */
  readonly executedAt: Date | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/** 対象ユーザーが退職状態でない場合のエラー */
export class UserNotResignedError extends Error {
  public readonly userId: string

  constructor(userId: string) {
    super(`User is not in RESIGNED status: ${userId}`)
    this.name = 'UserNotResignedError'
    this.userId = userId
  }
}

/** 対象ユーザーが既に匿名化済みの場合のエラー */
export class UserAlreadyAnonymizedError extends Error {
  public readonly userId: string

  constructor(userId: string) {
    super(`User is already anonymized: ${userId}`)
    this.name = 'UserAlreadyAnonymizedError'
    this.userId = userId
  }
}

/** 対象ユーザーが見つからない場合のエラー */
export class UserNotFoundError extends Error {
  public readonly userId: string

  constructor(userId: string) {
    super(`User not found: ${userId}`)
    this.name = 'UserNotFoundError'
    this.userId = userId
  }
}
