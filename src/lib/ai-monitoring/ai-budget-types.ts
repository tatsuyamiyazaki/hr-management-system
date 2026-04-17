/**
 * AI 予算アラート / 非クリティカル機能停止 (Task 5.3)
 *
 * - 月次 AI 予算設定 (AIBudgetConfig) の型とスキーマ
 * - 閾値到達時のアラートレベル
 * - 予算 100% 到達時に停止する非クリティカル機能一覧
 *
 * 関連要件:
 *   - Req 19.3: 月次AI利用コストが設定予算の 80% 到達で ADMIN に WARN アラート
 *   - Req 19.4: 月次AI利用コストが設定予算の 100% 到達で ADMIN に CRITICAL アラート、
 *               かつ非クリティカル機能 (要約生成 等) を一時停止
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// YearMonth
// ─────────────────────────────────────────────────────────────────────────────

/** YYYY-MM 形式 (例: "2026-04") */
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
export type YearMonth = z.infer<typeof yearMonthSchema>

export function isYearMonth(value: unknown): value is YearMonth {
  return yearMonthSchema.safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// AIBudgetConfig (design.md 1555-1561 に準拠)
// ─────────────────────────────────────────────────────────────────────────────

export const aiBudgetConfigSchema = z.object({
  yearMonth: yearMonthSchema,
  /** 月次予算 (USD, 正の数) */
  budgetUsd: z.number().positive(),
  /** WARN 閾値 (%) */
  warnThresholdPct: z.number().int().min(1).max(100).default(80),
  /** CRITICAL 閾値 (%) — 超過時の挙動を許容するため 200% までとする */
  criticalThresholdPct: z.number().int().min(1).max(200).default(100),
  /** 非クリティカル機能が予算超過により停止されているか */
  nonCriticalDisabled: z.boolean().default(false),
})

export type AIBudgetConfig = z.infer<typeof aiBudgetConfigSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Alert Level / Evaluation
// ─────────────────────────────────────────────────────────────────────────────

export const ALERT_LEVELS = ['NONE', 'WARN', 'CRITICAL'] as const
export type AlertLevel = (typeof ALERT_LEVELS)[number]

export function isAlertLevel(value: unknown): value is AlertLevel {
  return typeof value === 'string' && (ALERT_LEVELS as readonly string[]).includes(value)
}

export interface BudgetEvaluation {
  readonly yearMonth: YearMonth
  readonly currentCostUsd: number
  readonly budgetUsd: number
  readonly utilizationPct: number
  readonly level: AlertLevel
}

// ─────────────────────────────────────────────────────────────────────────────
// 非クリティカル機能フラグ (Req 19.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 予算 100% 到達時に自動停止する非クリティカル機能一覧。
 * 設計書の「非クリティカル機能（要約生成等）」の「等」を拡張可能にするため
 * 配列で表現する。現状は FB 要約生成と変換を対象とするが、呼び出し側で
 * オーバーライド可能 (AIBudgetService の nonCriticalFeatures 引数)。
 */
export const NON_CRITICAL_FEATURES = [
  /** FB 要約生成 */
  'FEEDBACK_SUMMARY',
  /** FB マイルド化変換 */
  'FEEDBACK_TRANSFORM',
] as const

export type NonCriticalFeature = (typeof NON_CRITICAL_FEATURES)[number]

export function isNonCriticalFeature(value: unknown): value is NonCriticalFeature {
  return typeof value === 'string' && (NON_CRITICAL_FEATURES as readonly string[]).includes(value)
}
