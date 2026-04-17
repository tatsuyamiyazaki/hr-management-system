/**
 * AI 運用ダッシュボードサービス
 *
 * Task 5.4 — ADMIN 向けに AI 利用状況をスナップショット / プロバイダ比較 /
 * 失敗率 として集計する。
 *
 * 依存方針:
 * - Task 5.2 の AIMonitoringService / AIUsageRepository には直接依存せず、
 *   narrow port `DashboardUsageQueryPort` 経由で DI する。これにより
 *   永続化実装 (Prisma/memory) や呼び出し元 (API route / CLI / Job) を選ばない。
 *
 * 関連要件:
 * - Req 19.2: 月次/週次/日次のコスト推移とユーザー別使用量
 * - Req 19.6: AI API 失敗率の記録と表示
 * - Req 19.7: プロバイダ切替前後の利用量とコストの並列表示
 */
import { type AIProviderName, AI_PROVIDER_NAMES } from '@/lib/ai-gateway/ai-gateway-types'
import { type UserRole } from '@/lib/notification/notification-types'

import {
  dashboardRangeSchema,
  isAdminRole,
  type CostTimeSeries,
  type CostTimeSeriesPoint,
  type DashboardRange,
  type DashboardSnapshot,
  type FailureRateSnapshot,
  type Granularity,
  type ProviderComparisonReport,
  type ProviderComparisonRow,
  type UserUsageRow,
} from './ai-dashboard-types'

// ─────────────────────────────────────────────────────────────────────────────
// 例外
// ─────────────────────────────────────────────────────────────────────────────

/** ADMIN 以外がダッシュボードを閲覧しようとした場合 */
export class AIDashboardForbiddenError extends Error {
  public readonly role: UserRole

  constructor(role: UserRole) {
    super(`AI dashboard forbidden for role: ${role}`)
    this.name = 'AIDashboardForbiddenError'
    this.role = role
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// narrow port — 外部の AI 利用ログストアへのクエリ抽象
// ─────────────────────────────────────────────────────────────────────────────

/** 使用ログ 1 件。Task 5.2 の AIUsageRecord 相当 (narrow) */
export interface DashboardUsageRecord {
  readonly userId: string
  readonly domain: string
  readonly provider: AIProviderName
  readonly promptTokens: number
  readonly completionTokens: number
  readonly estimatedCostUsd: number
  readonly latencyMs: number
  readonly cacheHit: boolean
  readonly createdAt: Date
}

/** 失敗ログ 1 件 (Req 19.6) */
export interface DashboardFailureRecord {
  readonly userId: string
  readonly errorCategory: string
  readonly createdAt: Date
}

export interface DashboardUsageQueryPort {
  listByDateRange(range: {
    readonly from: Date
    readonly to: Date
  }): Promise<readonly DashboardUsageRecord[]>

  listFailuresByDateRange(range: {
    readonly from: Date
    readonly to: Date
  }): Promise<readonly DashboardFailureRecord[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service 公開 API
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardRequester {
  readonly userId: string
  readonly role: UserRole
}

export interface GetSnapshotRequest {
  readonly requester: DashboardRequester
  readonly range: DashboardRange
  /** topUsers に表示するユーザー数。default 10 */
  readonly topUsersLimit?: number
}

export interface GetProviderComparisonRequest {
  readonly requester: DashboardRequester
  readonly period: { readonly from: Date; readonly to: Date }
}

export interface GetFailureRateRequest {
  readonly requester: DashboardRequester
  readonly period: { readonly from: Date; readonly to: Date }
}

export interface AIDashboardService {
  /** ADMIN のみ。他ロールは AIDashboardForbiddenError */
  getSnapshot(request: GetSnapshotRequest): Promise<DashboardSnapshot>

  /** プロバイダ比較 (Req 19.7) */
  getProviderComparison(request: GetProviderComparisonRequest): Promise<ProviderComparisonReport>

  /** 失敗率スナップショット (Req 19.6) */
  getFailureRate(request: GetFailureRateRequest): Promise<FailureRateSnapshot>
}

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TOP_USERS_LIMIT = 10
const MS_PER_DAY = 86_400_000

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ — バケット化
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** UTC ベースの 'YYYY-MM-DD' */
function formatDayBucket(d: Date): string {
  const y = d.getUTCFullYear()
  const m = pad2(d.getUTCMonth() + 1)
  const day = pad2(d.getUTCDate())
  return `${y}-${m}-${day}`
}

/** UTC ベースの 'YYYY-MM' */
function formatMonthBucket(d: Date): string {
  const y = d.getUTCFullYear()
  const m = pad2(d.getUTCMonth() + 1)
  return `${y}-${m}`
}

/**
 * ISO 8601 週番号。'YYYY-Www' 形式。
 * ISO 週は月曜始まり、木曜を含む週の年を "週番号年" とする。
 */
function formatWeekBucket(d: Date): string {
  // UTC ベースで日付のみに正規化
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // ISO 週: 月曜始まり (getUTCDay() は日=0..土=6)。木曜へ移動して週年を決める
  const dayOfWeek = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayOfWeek)
  const weekYear = utc.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7)
  return `${weekYear}-W${pad2(weekNo)}`
}

function bucketKey(d: Date, granularity: Granularity): string {
  if (granularity === 'DAY') {
    return formatDayBucket(d)
  }
  if (granularity === 'WEEK') {
    return formatWeekBucket(d)
  }
  return formatMonthBucket(d)
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ — 集計
// ─────────────────────────────────────────────────────────────────────────────

interface MutableCostBucket {
  costUsd: number
  requests: number
  promptTokens: number
  completionTokens: number
}

function emptyCostBucket(): MutableCostBucket {
  return { costUsd: 0, requests: 0, promptTokens: 0, completionTokens: 0 }
}

function aggregateCostSeries(
  records: readonly DashboardUsageRecord[],
  granularity: Granularity,
): CostTimeSeries {
  const buckets = new Map<string, MutableCostBucket>()
  for (const r of records) {
    const key = bucketKey(r.createdAt, granularity)
    const cur = buckets.get(key) ?? emptyCostBucket()
    cur.costUsd += r.estimatedCostUsd
    cur.requests += 1
    cur.promptTokens += r.promptTokens
    cur.completionTokens += r.completionTokens
    buckets.set(key, cur)
  }

  const points: CostTimeSeriesPoint[] = Array.from(buckets.entries())
    .map(([bucket, agg]) => ({
      bucket,
      costUsd: agg.costUsd,
      requests: agg.requests,
      promptTokens: agg.promptTokens,
      completionTokens: agg.completionTokens,
    }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0))

  return { granularity, points }
}

function aggregateTopUsers(
  records: readonly DashboardUsageRecord[],
  limit: number,
): readonly UserUsageRow[] {
  interface MutableRow {
    userId: string
    costUsd: number
    requests: number
    promptTokens: number
    completionTokens: number
  }
  const byUser = new Map<string, MutableRow>()
  for (const r of records) {
    const cur = byUser.get(r.userId) ?? {
      userId: r.userId,
      costUsd: 0,
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
    }
    cur.costUsd += r.estimatedCostUsd
    cur.requests += 1
    cur.promptTokens += r.promptTokens
    cur.completionTokens += r.completionTokens
    byUser.set(r.userId, cur)
  }

  return Array.from(byUser.values())
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, limit)
    .map((row) => ({
      userId: row.userId,
      costUsd: row.costUsd,
      requests: row.requests,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
    }))
}

function providerOrder(provider: AIProviderName): number {
  const idx = AI_PROVIDER_NAMES.indexOf(provider)
  return idx === -1 ? AI_PROVIDER_NAMES.length : idx
}

function aggregateProviderComparison(
  records: readonly DashboardUsageRecord[],
  period: { readonly from: Date; readonly to: Date },
): ProviderComparisonReport {
  interface MutableRow {
    provider: AIProviderName
    requests: number
    costUsd: number
    totalLatencyMs: number
    cacheHits: number
  }
  const byProvider = new Map<AIProviderName, MutableRow>()
  for (const r of records) {
    const cur = byProvider.get(r.provider) ?? {
      provider: r.provider,
      requests: 0,
      costUsd: 0,
      totalLatencyMs: 0,
      cacheHits: 0,
    }
    cur.requests += 1
    cur.costUsd += r.estimatedCostUsd
    cur.totalLatencyMs += r.latencyMs
    if (r.cacheHit) {
      cur.cacheHits += 1
    }
    byProvider.set(r.provider, cur)
  }

  const rows: ProviderComparisonRow[] = Array.from(byProvider.values())
    .map((row) => ({
      provider: row.provider,
      requests: row.requests,
      costUsd: row.costUsd,
      avgLatencyMs: row.requests === 0 ? 0 : row.totalLatencyMs / row.requests,
      cacheHitRate: row.requests === 0 ? 0 : row.cacheHits / row.requests,
    }))
    .sort((a, b) => providerOrder(a.provider) - providerOrder(b.provider))

  return { period, rows }
}

function aggregateFailureRate(
  successes: readonly DashboardUsageRecord[],
  failures: readonly DashboardFailureRecord[],
): FailureRateSnapshot {
  const totalAttempts = successes.length + failures.length
  const failureCount = failures.length
  const failureRate = totalAttempts === 0 ? 0 : failureCount / totalAttempts
  const byErrorCategory: Record<string, number> = {}
  for (const f of failures) {
    byErrorCategory[f.errorCategory] = (byErrorCategory[f.errorCategory] ?? 0) + 1
  }
  return {
    totalAttempts,
    failureCount,
    failureRate,
    byErrorCategory,
  }
}

function assertPeriod(period: { readonly from: Date; readonly to: Date }): {
  readonly from: Date
  readonly to: Date
} {
  if (!(period.from instanceof Date) || !(period.to instanceof Date)) {
    throw new TypeError('period.from and period.to must be Date instances')
  }
  if (period.from > period.to) {
    throw new RangeError('period.from must be <= period.to')
  }
  return { from: period.from, to: period.to }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

interface Dependencies {
  readonly usageQuery: DashboardUsageQueryPort
}

class AIDashboardServiceImpl implements AIDashboardService {
  constructor(private readonly deps: Dependencies) {}

  async getSnapshot(request: GetSnapshotRequest): Promise<DashboardSnapshot> {
    // 1) ロール判定を最初に行い、副作用を一切起こさない
    this.assertAdmin(request.requester.role)

    // 2) 入力検証
    const range = dashboardRangeSchema.parse(request.range)
    const topUsersLimit = request.topUsersLimit ?? DEFAULT_TOP_USERS_LIMIT
    if (!Number.isInteger(topUsersLimit) || topUsersLimit <= 0) {
      throw new RangeError(`topUsersLimit must be a positive integer (got ${topUsersLimit})`)
    }

    // 3) 使用ログと失敗ログを取得
    const period = { from: range.from, to: range.to }
    const [usageRecords, failureRecords] = await Promise.all([
      this.deps.usageQuery.listByDateRange(period),
      this.deps.usageQuery.listFailuresByDateRange(period),
    ])

    // 4) 集計
    const costSeries = aggregateCostSeries(usageRecords, range.granularity)
    const topUsers = aggregateTopUsers(usageRecords, topUsersLimit)
    const failureRate = aggregateFailureRate(usageRecords, failureRecords)
    const providerComparison = aggregateProviderComparison(usageRecords, period)

    return {
      range: { from: range.from, to: range.to, granularity: range.granularity },
      costSeries,
      topUsers,
      failureRate,
      providerComparison,
    }
  }

  async getProviderComparison(
    request: GetProviderComparisonRequest,
  ): Promise<ProviderComparisonReport> {
    this.assertAdmin(request.requester.role)
    const period = assertPeriod(request.period)
    const usageRecords = await this.deps.usageQuery.listByDateRange(period)
    return aggregateProviderComparison(usageRecords, period)
  }

  async getFailureRate(request: GetFailureRateRequest): Promise<FailureRateSnapshot> {
    this.assertAdmin(request.requester.role)
    const period = assertPeriod(request.period)
    const [usageRecords, failureRecords] = await Promise.all([
      this.deps.usageQuery.listByDateRange(period),
      this.deps.usageQuery.listFailuresByDateRange(period),
    ])
    return aggregateFailureRate(usageRecords, failureRecords)
  }

  private assertAdmin(role: UserRole): void {
    if (!isAdminRole(role)) {
      throw new AIDashboardForbiddenError(role)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createAIDashboardService(deps: Dependencies): AIDashboardService {
  return new AIDashboardServiceImpl(deps)
}
