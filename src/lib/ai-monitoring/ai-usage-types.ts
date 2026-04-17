/**
 * AIMonitoring 型定義
 *
 * AI 呼び出しのトークン使用量・コスト・失敗記録を集計する型群。
 * AIUsageRecord (Prisma モデル相当) の in-memory 表現と、集計結果の型を提供する。
 *
 * 関連要件: Req 19.1, Req 19.2, Req 19.5, Req 19.6, Req 19.8
 */
import { z } from 'zod'
import { AI_DOMAINS, AI_PROVIDER_NAMES } from '@/lib/ai-gateway/ai-gateway-types'

// ─────────────────────────────────────────────────────────────────────────────
// AIUsageEntry — 成功した AI 呼び出し 1 件の記録 (Req 19.1, 19.8)
// ─────────────────────────────────────────────────────────────────────────────

export const aiUsageEntrySchema = z.object({
  /** 呼び出し元ユーザー ID。認証コンテキストがない場合は 'unknown' で埋める */
  userId: z.string().min(1),
  /** 機能ドメイン ('ai-coach' | 'feedback') */
  domain: z.enum(AI_DOMAINS),
  /** 実際に呼び出されたプロバイダ */
  provider: z.enum(AI_PROVIDER_NAMES),
  /** 入力トークン数 (プロンプト全体) */
  promptTokens: z.number().int().min(0),
  /** 出力トークン数 */
  completionTokens: z.number().int().min(0),
  /** 推定コスト (USD, 単価 × トークン数) */
  estimatedCostUsd: z.number().min(0),
  /** プロバイダ呼び出しレイテンシ (ms)。キャッシュヒット時は 0 を許容 */
  latencyMs: z.number().int().min(0),
  /** キャッシュヒットだったか (Req 19.8) */
  cacheHit: z.boolean(),
  /** リクエストトレース ID */
  requestId: z.string().min(1),
  /** 発生時刻 */
  createdAt: z.date(),
})

export type AIUsageEntry = z.infer<typeof aiUsageEntrySchema>

// ─────────────────────────────────────────────────────────────────────────────
// AIUsageFailure — 失敗した AI 呼び出し 1 件の記録 (Req 19.6)
// ─────────────────────────────────────────────────────────────────────────────

export const AI_USAGE_ERROR_CATEGORIES = ['TIMEOUT', 'PROVIDER_ERROR', 'INVALID_OUTPUT'] as const
export type AIUsageErrorCategory = (typeof AI_USAGE_ERROR_CATEGORIES)[number]

export const aiUsageFailureSchema = z.object({
  userId: z.string().min(1),
  domain: z.enum(AI_DOMAINS),
  provider: z.enum(AI_PROVIDER_NAMES),
  /** 何回目の試行で失敗したか (1 から始まる) */
  attemptCount: z.number().int().min(1),
  errorCategory: z.enum(AI_USAGE_ERROR_CATEGORIES),
  latencyMs: z.number().int().min(0),
  requestId: z.string().min(1),
  createdAt: z.date(),
})

export type AIUsageFailure = z.infer<typeof aiUsageFailureSchema>

// ─────────────────────────────────────────────────────────────────────────────
// 集計用共通型
// ─────────────────────────────────────────────────────────────────────────────

export interface DateRange {
  readonly from: Date
  readonly to: Date
}

/** 月次コストサマリ (yearMonth: 'YYYY-MM') */
export interface MonthlyCostSummary {
  readonly yearMonth: string
  readonly totalCostUsd: number
  readonly totalRequests: number
  readonly byProvider: Readonly<Record<string, number>>
  readonly byDomain: Readonly<Record<string, number>>
  readonly byDay: readonly {
    readonly date: string
    readonly costUsd: number
    readonly requests: number
  }[]
}

/** ユーザー単位の使用量サマリ */
export interface UserUsageSummary {
  readonly userId: string
  readonly period: DateRange
  readonly totalCostUsd: number
  readonly totalRequests: number
  readonly totalPromptTokens: number
  readonly totalCompletionTokens: number
  /** 0.0 - 1.0。リクエスト 0 件のときは 0 */
  readonly cacheHitRate: number
}

/** 異常利用フラグ (Req 19.5: 通常の 5 倍超過) */
export interface AnomalyFlag {
  readonly userId: string
  readonly yearMonth: string
  readonly currentCostUsd: number
  readonly baselineCostUsd: number
  /** currentCost / baseline。baseline が 0 の場合は検出対象外 */
  readonly multiplier: number
  readonly detectedAt: Date
}

/** 失敗率サマリ (Req 19.6) */
export interface FailureRateSummary {
  readonly period: DateRange
  readonly totalAttempts: number
  readonly failureCount: number
  /** failureCount / totalAttempts。attempts 0 のときは 0 */
  readonly failureRate: number
  readonly byErrorCategory: Readonly<Record<string, number>>
}

// ─────────────────────────────────────────────────────────────────────────────
// 独自例外
// ─────────────────────────────────────────────────────────────────────────────

/** yearMonth が 'YYYY-MM' 形式でないとき */
export class InvalidYearMonthError extends Error {
  public readonly input: string

  constructor(input: string) {
    super(`Invalid yearMonth format: "${input}" (expected 'YYYY-MM')`)
    this.name = 'InvalidYearMonthError'
    this.input = input
  }
}
