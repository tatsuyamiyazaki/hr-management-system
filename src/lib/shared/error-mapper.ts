/**
 * DomainError → HTTP ステータス・API エラーコードのマッパー
 *
 * 全 API Route でこのマッパーを共通利用し、
 * サービス層の DomainError を HTTP レスポンスに変換する。
 */
import type { DomainError } from './domain-error'

/** API エラーコード */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'AI_TIMEOUT'
  | 'AI_QUOTA_EXCEEDED'
  | 'INTERNAL_ERROR'

/**
 * DomainError を HTTP ステータスコードに変換する
 */
export function domainErrorToHttpStatus(error: DomainError): number {
  switch (error._tag) {
    case 'ValidationError':
    case 'PasswordPolicyViolation':
      return 400

    case 'Unauthorized':
    case 'AccountLocked':
      return 401

    case 'Forbidden':
      return 403

    case 'NotFound':
      return 404

    case 'Conflict':
    case 'CycleStateInvalid':
      return 409

    case 'CyclicReference':
    case 'TargetLimitExceeded':
    case 'MinimumEvaluatorNotMet':
    case 'QualityGateNotPassed':
    case 'AppealDeadlineExceeded':
      return 422

    case 'RateLimited':
      return 429

    case 'AITimeout':
    case 'AIQuotaExceeded':
    case 'AIProviderError':
      return 503

    default: {
      // 網羅性チェック: すべての DomainError タグを処理済みであることを確認
      void (error satisfies never)
      return 500
    }
  }
}

/**
 * DomainError を API エラーコードに変換する
 */
export function domainErrorToApiCode(error: DomainError): ApiErrorCode {
  switch (error._tag) {
    case 'ValidationError':
    case 'PasswordPolicyViolation':
    case 'CyclicReference':
    case 'TargetLimitExceeded':
    case 'MinimumEvaluatorNotMet':
    case 'QualityGateNotPassed':
    case 'AppealDeadlineExceeded':
      return 'VALIDATION_ERROR'

    case 'Unauthorized':
    case 'AccountLocked':
      return 'UNAUTHORIZED'

    case 'Forbidden':
      return 'FORBIDDEN'

    case 'NotFound':
      return 'NOT_FOUND'

    case 'Conflict':
    case 'CycleStateInvalid':
      return 'CONFLICT'

    case 'RateLimited':
      return 'RATE_LIMITED'

    case 'AITimeout':
      return 'AI_TIMEOUT'

    case 'AIQuotaExceeded':
      return 'AI_QUOTA_EXCEEDED'

    case 'AIProviderError':
      return 'INTERNAL_ERROR'

    default: {
      void (error satisfies never)
      return 'INTERNAL_ERROR'
    }
  }
}

/**
 * DomainError から人間が読めるメッセージを生成する
 */
export function domainErrorToMessage(error: DomainError): string {
  switch (error._tag) {
    case 'ValidationError':
      return error.message
    case 'Unauthorized':
      return '認証が必要です'
    case 'AccountLocked':
      return `アカウントがロックされています。${error.unlockAt.toISOString()} に解除されます`
    case 'Forbidden':
      return 'この操作を行う権限がありません'
    case 'PasswordPolicyViolation':
      return 'パスワードがポリシーに違反しています'
    case 'NotFound':
      return `${error.resource} が見つかりません`
    case 'Conflict':
      return error.detail
    case 'CyclicReference':
      return '循環参照が発生します'
    case 'TargetLimitExceeded':
      return `評価対象者の上限（${error.max}人）を超えています`
    case 'MinimumEvaluatorNotMet':
      return `最低評価者数（${error.required}人）に達していません（現在: ${error.current}人）`
    case 'QualityGateNotPassed':
      return '評価コメントの品質基準を満たしていません'
    case 'CycleStateInvalid':
      return `サイクルの状態が不正です（現在: ${error.current}）`
    case 'AppealDeadlineExceeded':
      return '異議申立ての期限を超えています'
    case 'AITimeout':
      return 'AIサービスがタイムアウトしました'
    case 'AIQuotaExceeded':
      return 'AI利用上限に達しています'
    case 'AIProviderError':
      return 'AIサービスでエラーが発生しました'
    case 'RateLimited':
      return `レート制限に達しました。${error.retryAfterSec}秒後に再試行してください`
    default: {
      void (error satisfies never)
      return '予期せぬエラーが発生しました'
    }
  }
}
