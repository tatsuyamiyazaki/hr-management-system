/**
 * AI 運用ダッシュボード 型定義
 *
 * Task 5.4 — AI コスト推移・プロバイダ比較・失敗率を ADMIN 向けに集計する
 * ダッシュボードの共通型とスキーマ。
 *
 * 関連要件:
 * - Req 19.2: 月次/週次/日次のコスト推移とユーザー別使用量
 * - Req 19.6: AI API 失敗率・再試行の記録と表示
 * - Req 19.7: プロバイダ切替前後の利用量とコストの並列表示
 */
import { z } from 'zod'

import { type AIProviderName } from '@/lib/ai-gateway/ai-gateway-types'
import { type UserRole } from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// 粒度 (Granularity)
// ─────────────────────────────────────────────────────────────────────────────

/** コスト推移の集計粒度 */
export const GRANULARITIES = ['DAY', 'WEEK', 'MONTH'] as const
export type Granularity = (typeof GRANULARITIES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// ダッシュボード期間
// ─────────────────────────────────────────────────────────────────────────────

/** ダッシュボード取得範囲 (from <= to) */
export const dashboardRangeSchema = z
  .object({
    from: z.date(),
    to: z.date(),
    granularity: z.enum(GRANULARITIES),
  })
  .refine((v) => v.from <= v.to, { message: 'from must be <= to' })

export type DashboardRange = z.infer<typeof dashboardRangeSchema>

// ─────────────────────────────────────────────────────────────────────────────
// コスト推移
// ─────────────────────────────────────────────────────────────────────────────

/** コスト推移の 1 バケット */
export interface CostTimeSeriesPoint {
  /** 'YYYY-MM-DD' (DAY) / 'YYYY-Www' (WEEK, ISO 週) / 'YYYY-MM' (MONTH) */
  readonly bucket: string
  readonly costUsd: number
  readonly requests: number
  readonly promptTokens: number
  readonly completionTokens: number
}

export interface CostTimeSeries {
  readonly granularity: Granularity
  readonly points: readonly CostTimeSeriesPoint[]
}

// ─────────────────────────────────────────────────────────────────────────────
// ユーザー別使用量
// ─────────────────────────────────────────────────────────────────────────────

export interface UserUsageRow {
  readonly userId: string
  readonly costUsd: number
  readonly requests: number
  readonly promptTokens: number
  readonly completionTokens: number
}

// ─────────────────────────────────────────────────────────────────────────────
// 失敗率スナップショット (Req 19.6)
// ─────────────────────────────────────────────────────────────────────────────

export interface FailureRateSnapshot {
  /** 成功 + 失敗の合計試行数 */
  readonly totalAttempts: number
  readonly failureCount: number
  /** 0.0 - 1.0。試行 0 件の場合は 0 */
  readonly failureRate: number
  /** エラーカテゴリ別の失敗内訳 */
  readonly byErrorCategory: Readonly<Record<string, number>>
}

// ─────────────────────────────────────────────────────────────────────────────
// プロバイダ比較 (Req 19.7)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderComparisonRow {
  readonly provider: AIProviderName
  readonly requests: number
  readonly costUsd: number
  readonly avgLatencyMs: number
  /** 0.0 - 1.0。データが 0 件の場合は 0 */
  readonly cacheHitRate: number
}

export interface ProviderComparisonReport {
  readonly period: { readonly from: Date; readonly to: Date }
  readonly rows: readonly ProviderComparisonRow[]
}

// ─────────────────────────────────────────────────────────────────────────────
// ダッシュボードスナップショット
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardSnapshot {
  readonly range: {
    readonly from: Date
    readonly to: Date
    readonly granularity: Granularity
  }
  readonly costSeries: CostTimeSeries
  readonly topUsers: readonly UserUsageRow[]
  readonly failureRate: FailureRateSnapshot
  readonly providerComparison: ProviderComparisonReport
}

// ─────────────────────────────────────────────────────────────────────────────
// 認可
// ─────────────────────────────────────────────────────────────────────────────

/** ダッシュボードを閲覧可能なロール (ADMIN のみ) */
export const ADMIN_ROLES: readonly UserRole[] = ['ADMIN']

/** 指定ロールが ADMIN 相当かを判定する */
export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role)
}
