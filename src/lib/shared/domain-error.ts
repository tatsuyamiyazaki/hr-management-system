/**
 * ドメインエラー判別共用体と Result 型
 *
 * サービス層は Result<T, DomainError> パターンを使用する。
 * neverthrow ライブラリの ok/err ヘルパーを再エクスポートして
 * 全ドメインで統一的に使用できるようにする。
 */
import { ok as _ok, err as _err, type Result as NeverThrowResult } from 'neverthrow'

// ─────────────────────────────────────────────────────────────────────────────
// DomainError 判別共用体
// ─────────────────────────────────────────────────────────────────────────────

/** 入力検証エラー */
export type ValidationError = {
  _tag: 'ValidationError'
  field: string
  message: string
  details?: unknown
}

/** 未認証エラー */
export type UnauthorizedError = {
  _tag: 'Unauthorized'
  reason: 'NO_SESSION' | 'EXPIRED' | 'INVALID_TOKEN'
}

/** 権限不足エラー */
export type ForbiddenError = {
  _tag: 'Forbidden'
  requiredRole?: string
  reason: string
}

/** アカウントロックエラー */
export type AccountLockedError = {
  _tag: 'AccountLocked'
  unlockAt: Date
}

/** パスワードポリシー違反エラー */
export type PasswordPolicyViolationError = {
  _tag: 'PasswordPolicyViolation'
  rule: 'LENGTH' | 'COMPLEXITY' | 'REUSED'
}

/** リソース未検出エラー */
export type NotFoundError = {
  _tag: 'NotFound'
  resource: string
  id: string
}

/** 競合エラー */
export type ConflictError = {
  _tag: 'Conflict'
  detail: string
}

/** 循環参照エラー（組織ツリー） */
export type CyclicReferenceError = {
  _tag: 'CyclicReference'
  path: string[]
}

/** 評価対象者数上限超過エラー */
export type TargetLimitExceededError = {
  _tag: 'TargetLimitExceeded'
  max: number
}

/** 最低評価者数未達エラー */
export type MinimumEvaluatorNotMetError = {
  _tag: 'MinimumEvaluatorNotMet'
  current: number
  required: number
}

/** 品質ゲート不通過エラー */
export type QualityGateNotPassedError = {
  _tag: 'QualityGateNotPassed'
  missingAspects: string[]
}

/** サイクル状態不正エラー */
export type CycleStateInvalidError = {
  _tag: 'CycleStateInvalid'
  current: string
  attempted: string
}

/** 異議申立て期限超過エラー */
export type AppealDeadlineExceededError = {
  _tag: 'AppealDeadlineExceeded'
  deadline: Date
}

/** AI タイムアウトエラー */
export type AITimeoutError = {
  _tag: 'AITimeout'
  elapsedMs: number
}

/** AI 予算超過エラー */
export type AIQuotaExceededError = {
  _tag: 'AIQuotaExceeded'
  currentUsagePct: number
}

/** AI プロバイダーエラー */
export type AIProviderError = {
  _tag: 'AIProviderError'
  providerMessage: string
}

/** レート制限エラー */
export type RateLimitedError = {
  _tag: 'RateLimited'
  retryAfterSec: number
}

/** 全 DomainError の共用体 */
export type DomainError =
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | AccountLockedError
  | PasswordPolicyViolationError
  | NotFoundError
  | ConflictError
  | CyclicReferenceError
  | TargetLimitExceededError
  | MinimumEvaluatorNotMetError
  | QualityGateNotPassedError
  | CycleStateInvalidError
  | AppealDeadlineExceededError
  | AITimeoutError
  | AIQuotaExceededError
  | AIProviderError
  | RateLimitedError

// ─────────────────────────────────────────────────────────────────────────────
// Result 型 (neverthrow ベース)
// ─────────────────────────────────────────────────────────────────────────────

/** サービス層の戻り値型 */
export type Result<T, E extends DomainError = DomainError> = NeverThrowResult<T, E>

/**
 * 成功 Result を生成するヘルパー
 */
export function ok<T>(value: T): Result<T, never> {
  return _ok(value)
}

/**
 * 失敗 Result を生成するヘルパー
 */
export function err<E extends DomainError>(error: E): Result<never, E> {
  return _err(error)
}
