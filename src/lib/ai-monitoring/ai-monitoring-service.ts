/**
 * AIMonitoringService
 *
 * AI 呼び出し記録と集計を提供するアプリケーションサービス。
 * - recordUsage / recordFailure: AIUsageRepository への Zod 検証付き書き込み
 * - getMonthlyCost / getUserUsage / getFailureRate: 集計クエリ
 * - detectAnomaly: 通常の 5 倍超ユーザーを検出 (Req 19.5)
 *
 * 関連要件: Req 19.1, Req 19.2, Req 19.5, Req 19.6, Req 19.8
 * 注: Req 19.3/19.4 の予算アラート・機能停止は Task 5.3 で別サービスとして実装する。
 */
import {
  aiUsageEntrySchema,
  aiUsageFailureSchema,
  InvalidYearMonthError,
  type AIUsageEntry,
  type AIUsageFailure,
  type AnomalyFlag,
  type DateRange,
  type FailureRateSummary,
  type MonthlyCostSummary,
  type UserUsageSummary,
} from './ai-usage-types'
import type { AIUsageRepository } from './ai-usage-repository'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** 異常判定のしきい値 (通常の 5 倍超) */
const ANOMALY_MULTIPLIER_THRESHOLD = 5

/** ベースライン算出に使用する直近月数 (対象月の前 3 ヶ月) */
const ANOMALY_BASELINE_MONTHS = 3

/** 対象月のコストがこの値未満の場合、異常検知からノイズとして除外する (USD) */
const ANOMALY_NOISE_THRESHOLD_USD = 1

/** yearMonth の書式 'YYYY-MM' (01-12) */
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

// ─────────────────────────────────────────────────────────────────────────────
// 公開型
// ─────────────────────────────────────────────────────────────────────────────

export interface AIMonitoringService {
  recordUsage(entry: AIUsageEntry): Promise<void>
  recordFailure(entry: AIUsageFailure): Promise<void>
  getMonthlyCost(yearMonth: string): Promise<MonthlyCostSummary>
  getUserUsage(userId: string, period: DateRange): Promise<UserUsageSummary>
  getFailureRate(period: DateRange): Promise<FailureRateSummary>
  detectAnomaly(yearMonth: string): Promise<readonly AnomalyFlag[]>
}

export interface AIMonitoringDeps {
  readonly repository: AIUsageRepository
  /** 時刻ソース (テスト容易化のため DI)。detectAnomaly の detectedAt に使う */
  readonly clock?: () => Date
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function assertYearMonth(yearMonth: string): void {
  if (!YEAR_MONTH_PATTERN.test(yearMonth)) {
    throw new InvalidYearMonthError(yearMonth)
  }
}

/** 'YYYY-MM' → DateRange (UTC、半開区間 [from, to)) */
function yearMonthToRange(yearMonth: string): DateRange {
  assertYearMonth(yearMonth)
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr) // 1-12
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  return { from, to }
}

/** 'YYYY-MM' を n ヶ月シフト (負数で過去へ) */
function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [yearStr, monthStr] = yearMonth.split('-')
  const base = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1))
  base.setUTCMonth(base.getUTCMonth() + deltaMonths)
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Date → 'YYYY-MM-DD' (UTC) */
function toUtcDateString(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sumCost(entries: readonly AIUsageEntry[]): number {
  return entries.reduce((acc, e) => acc + e.estimatedCostUsd, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 集計関数
// ─────────────────────────────────────────────────────────────────────────────

function aggregateMonthlyCost(
  yearMonth: string,
  entries: readonly AIUsageEntry[],
): MonthlyCostSummary {
  const byProvider: Record<string, number> = {}
  const byDomain: Record<string, number> = {}
  const byDayMap = new Map<string, { costUsd: number; requests: number }>()

  for (const entry of entries) {
    byProvider[entry.provider] = (byProvider[entry.provider] ?? 0) + entry.estimatedCostUsd
    byDomain[entry.domain] = (byDomain[entry.domain] ?? 0) + entry.estimatedCostUsd

    const dayKey = toUtcDateString(entry.createdAt)
    const bucket = byDayMap.get(dayKey) ?? { costUsd: 0, requests: 0 }
    bucket.costUsd += entry.estimatedCostUsd
    bucket.requests += 1
    byDayMap.set(dayKey, bucket)
  }

  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, costUsd: v.costUsd, requests: v.requests }))

  return {
    yearMonth,
    totalCostUsd: sumCost(entries),
    totalRequests: entries.length,
    byProvider,
    byDomain,
    byDay,
  }
}

function aggregateUserUsage(
  userId: string,
  period: DateRange,
  entries: readonly AIUsageEntry[],
): UserUsageSummary {
  const totalRequests = entries.length
  const totalPromptTokens = entries.reduce((acc, e) => acc + e.promptTokens, 0)
  const totalCompletionTokens = entries.reduce((acc, e) => acc + e.completionTokens, 0)
  const cacheHits = entries.filter((e) => e.cacheHit).length
  const cacheHitRate = totalRequests === 0 ? 0 : cacheHits / totalRequests

  return {
    userId,
    period,
    totalCostUsd: sumCost(entries),
    totalRequests,
    totalPromptTokens,
    totalCompletionTokens,
    cacheHitRate,
  }
}

function aggregateFailureRate(
  period: DateRange,
  successes: readonly AIUsageEntry[],
  failures: readonly AIUsageFailure[],
): FailureRateSummary {
  const totalAttempts = successes.length + failures.length
  const failureCount = failures.length
  const failureRate = totalAttempts === 0 ? 0 : failureCount / totalAttempts
  const byErrorCategory: Record<string, number> = {}
  for (const f of failures) {
    byErrorCategory[f.errorCategory] = (byErrorCategory[f.errorCategory] ?? 0) + 1
  }
  return {
    period,
    totalAttempts,
    failureCount,
    failureRate,
    byErrorCategory,
  }
}

/** userId 別のコスト合計 Map を返す */
function groupCostByUser(entries: readonly AIUsageEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of entries) {
    map.set(e.userId, (map.get(e.userId) ?? 0) + e.estimatedCostUsd)
  }
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// 異常検知 (Req 19.5)
// ─────────────────────────────────────────────────────────────────────────────

async function collectBaselineCostsByUser(
  repository: AIUsageRepository,
  yearMonth: string,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>()
  for (let i = 1; i <= ANOMALY_BASELINE_MONTHS; i++) {
    const ym = shiftYearMonth(yearMonth, -i)
    const range = yearMonthToRange(ym)
    const entries = await repository.listByDateRange(range)
    for (const [userId, cost] of groupCostByUser(entries)) {
      totals.set(userId, (totals.get(userId) ?? 0) + cost)
    }
  }
  return totals
}

function buildAnomalyFlag(
  userId: string,
  yearMonth: string,
  currentCost: number,
  baselineTotal: number,
  detectedAt: Date,
): AnomalyFlag | null {
  // 対象月のコストが小さすぎるときはノイズとしてスキップ
  if (currentCost < ANOMALY_NOISE_THRESHOLD_USD) return null

  const baselineAverage = baselineTotal / ANOMALY_BASELINE_MONTHS
  // 直近 3 ヶ月のベースラインが 0 のユーザーは比較不能なのでスキップ
  if (baselineAverage <= 0) return null

  const multiplier = currentCost / baselineAverage
  if (multiplier <= ANOMALY_MULTIPLIER_THRESHOLD) return null

  return {
    userId,
    yearMonth,
    currentCostUsd: currentCost,
    baselineCostUsd: baselineAverage,
    multiplier,
    detectedAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createAIMonitoringService(deps: AIMonitoringDeps): AIMonitoringService {
  const { repository } = deps
  const clock = deps.clock ?? (() => new Date())

  async function recordUsage(entry: AIUsageEntry): Promise<void> {
    const parsed = aiUsageEntrySchema.parse(entry)
    await repository.create(parsed)
  }

  async function recordFailure(entry: AIUsageFailure): Promise<void> {
    const parsed = aiUsageFailureSchema.parse(entry)
    await repository.createFailure(parsed)
  }

  async function getMonthlyCost(yearMonth: string): Promise<MonthlyCostSummary> {
    const range = yearMonthToRange(yearMonth)
    const entries = await repository.listByDateRange(range)
    return aggregateMonthlyCost(yearMonth, entries)
  }

  async function getUserUsage(userId: string, period: DateRange): Promise<UserUsageSummary> {
    const entries = await repository.listByUser(userId, period)
    return aggregateUserUsage(userId, period, entries)
  }

  async function getFailureRate(period: DateRange): Promise<FailureRateSummary> {
    const successes = await repository.listByDateRange(period)
    const failures = await repository.listFailuresByDateRange(period)
    return aggregateFailureRate(period, successes, failures)
  }

  async function detectAnomaly(yearMonth: string): Promise<readonly AnomalyFlag[]> {
    const currentRange = yearMonthToRange(yearMonth)
    const currentEntries = await repository.listByDateRange(currentRange)
    const currentByUser = groupCostByUser(currentEntries)
    const baselineByUser = await collectBaselineCostsByUser(repository, yearMonth)

    const detectedAt = clock()
    const flags: AnomalyFlag[] = []
    for (const [userId, currentCost] of currentByUser) {
      const baselineTotal = baselineByUser.get(userId) ?? 0
      const flag = buildAnomalyFlag(userId, yearMonth, currentCost, baselineTotal, detectedAt)
      if (flag) flags.push(flag)
    }
    return flags
  }

  return {
    recordUsage,
    recordFailure,
    getMonthlyCost,
    getUserUsage,
    getFailureRate,
    detectAnomaly,
  }
}
