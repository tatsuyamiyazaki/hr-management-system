/**
 * API レスポンス統一形式ラッパー
 *
 * 全 API Route で使用するレスポンス形式:
 * { success, data, error, meta }
 */
import type { DomainError } from './domain-error'
import { domainErrorToApiCode, domainErrorToHttpStatus, domainErrorToMessage, type ApiErrorCode } from './error-mapper'

// ─────────────────────────────────────────────────────────────────────────────
// レスポンス型定義
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiMeta {
  timestamp: string
  requestId: string
  page?: number
  pageSize?: number
  total?: number
}

export interface ApiErrorDetail {
  code: ApiErrorCode
  message: string
  field?: string
  details?: unknown
}

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  error: null
  meta: ApiMeta
}

export interface ApiErrorResponse {
  success: false
  data: null
  error: ApiErrorDetail
  meta: ApiMeta
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

// ─────────────────────────────────────────────────────────────────────────────
// ページネーション
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー関数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 成功レスポンスを生成する
 */
export function apiSuccess<T>(
  data: T,
  requestId: string,
  pagination?: PaginationMeta,
): ApiSuccessResponse<T> {
  const meta: ApiMeta = {
    timestamp: new Date().toISOString(),
    requestId,
    ...pagination,
  }
  return { success: true, data, error: null, meta }
}

/**
 * エラーレスポンスを生成する
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ApiErrorResponse {
  const meta: ApiMeta = {
    timestamp: new Date().toISOString(),
    requestId,
  }
  const error: ApiErrorDetail = { code, message, ...(details !== undefined ? { details } : {}) }
  return { success: false, data: null, error, meta }
}

/**
 * DomainError から API エラーレスポンスを生成する
 */
export function domainErrorToApiResponse(
  domainError: DomainError,
  requestId: string,
): ApiErrorResponse {
  const code = domainErrorToApiCode(domainError)
  const message = domainErrorToMessage(domainError)

  // ValidationError の場合はフィールド情報を詳細に含める
  let details: unknown
  if (domainError._tag === 'ValidationError') {
    details = { field: domainError.field, ...(domainError.details ? { extra: domainError.details } : {}) }
  }

  return apiError(code, message, requestId, details)
}

/**
 * DomainError に対応する HTTP ステータスコードを返す（Route Handler で使用）
 */
export { domainErrorToHttpStatus }
