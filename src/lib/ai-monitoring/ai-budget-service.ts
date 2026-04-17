/**
 * AIBudgetService — 月次 AI 予算の評価・アラート発火・非クリティカル機能停止
 *
 * Task 5.2 (AIMonitoringService) への依存を切り離すため、narrow port
 * (BudgetCostQueryPort) 経由で現在コストを取得する。本番配線時に
 * AIMonitoringService.getMonthlyCost() を包むアダプタを与える。
 *
 * 関連要件: Req 19.3 (WARN 80%), Req 19.4 (CRITICAL 100% + 非クリティカル停止)
 */
import type { AIAlertNotifier } from './ai-alert-notifier'
import type { AIBudgetRepository } from './ai-budget-repository'
import {
  NON_CRITICAL_FEATURES,
  aiBudgetConfigSchema,
  yearMonthSchema,
  type AIBudgetConfig,
  type AlertLevel,
  type BudgetEvaluation,
  type NonCriticalFeature,
  type YearMonth,
} from './ai-budget-types'
import type { FeatureFlagStore } from './feature-flag-store'

// ─────────────────────────────────────────────────────────────────────────────
// Ports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Task 5.2 (AIMonitoringService) からの narrow port。
 * 実体は AIMonitoringService.getMonthlyCost() を包むアダプタで注入する。
 */
export interface BudgetCostQueryPort {
  getMonthlyCostUsd(yearMonth: YearMonth): Promise<number>
}

/**
 * 監査ログ出力用の narrow port。
 * AuditLogEmitter の AuditLogEntry は action が固定 enum のため、
 * 本サービスでは AI_BUDGET_THRESHOLD_REACHED のような専用 action を扱える
 * よう緩めた形状で受け取る。production 配線時は AuditAction enum 拡張後に
 * AuditLogEmitter を直接渡せるようにする。
 */
export interface BudgetAuditLogPort {
  emit(entry: {
    userId: string | null
    action: string
    resourceType: string
    resourceId: string | null
    ipAddress: string
    userAgent: string
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
  }): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/** 該当月の AIBudgetConfig が未設定 */
export class AIBudgetNotConfiguredError extends Error {
  public readonly yearMonth: YearMonth

  constructor(yearMonth: YearMonth) {
    super(`AIBudgetConfig is not configured for ${yearMonth}`)
    this.name = 'AIBudgetNotConfiguredError'
    this.yearMonth = yearMonth
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AIBudgetService {
  /** 現状のコストを閾値と比較して評価する (通知・機能停止は発火しない) */
  evaluate(yearMonth: YearMonth): Promise<BudgetEvaluation>
  /**
   * 閾値を評価し、到達していればアラートを送信し、100% 到達なら非クリティカル機能を停止する。
   * 複数回呼ばれても冪等 (同 yearMonth + level を重複通知しない)。
   */
  checkAndAlert(yearMonth: YearMonth): Promise<BudgetEvaluation>
  /** 予算設定を更新 */
  upsertBudget(config: AIBudgetConfig): Promise<AIBudgetConfig>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

function computeAlertLevel(
  utilizationPct: number,
  warnThresholdPct: number,
  criticalThresholdPct: number,
): AlertLevel {
  if (utilizationPct >= criticalThresholdPct) return 'CRITICAL'
  if (utilizationPct >= warnThresholdPct) return 'WARN'
  return 'NONE'
}

interface ServiceDeps {
  readonly costQuery: BudgetCostQueryPort
  readonly budgetRepo: AIBudgetRepository
  readonly flagStore: FeatureFlagStore
  readonly notifier: AIAlertNotifier
  readonly auditLogger?: BudgetAuditLogPort
  readonly nonCriticalFeatures: readonly NonCriticalFeature[]
  readonly clock: () => Date
}

class DefaultAIBudgetService implements AIBudgetService {
  private readonly deps: ServiceDeps

  constructor(deps: ServiceDeps) {
    this.deps = deps
  }

  async evaluate(yearMonth: YearMonth): Promise<BudgetEvaluation> {
    const key = yearMonthSchema.parse(yearMonth)
    const config = await this.deps.budgetRepo.get(key)
    if (!config) {
      throw new AIBudgetNotConfiguredError(key)
    }

    const currentCostUsd = await this.deps.costQuery.getMonthlyCostUsd(key)
    // 予算設定時点で budgetUsd > 0 が保証されている (zod positive)。
    const utilizationPct = (currentCostUsd / config.budgetUsd) * 100
    const level = computeAlertLevel(
      utilizationPct,
      config.warnThresholdPct,
      config.criticalThresholdPct,
    )

    return {
      yearMonth: key,
      currentCostUsd,
      budgetUsd: config.budgetUsd,
      utilizationPct,
      level,
    }
  }

  async checkAndAlert(yearMonth: YearMonth): Promise<BudgetEvaluation> {
    const evaluation = await this.evaluate(yearMonth)

    if (evaluation.level === 'NONE') {
      return evaluation
    }

    // WARN / CRITICAL: ADMIN に通知 (notifier 側で冪等制御)
    await this.deps.notifier.notify({
      yearMonth: evaluation.yearMonth,
      level: evaluation.level,
      currentCostUsd: evaluation.currentCostUsd,
      budgetUsd: evaluation.budgetUsd,
      utilizationPct: evaluation.utilizationPct,
    })

    if (evaluation.level === 'CRITICAL') {
      await this.disableNonCriticalFeatures(evaluation.yearMonth)
    }

    await this.recordAudit(evaluation)

    return evaluation
  }

  async upsertBudget(config: AIBudgetConfig): Promise<AIBudgetConfig> {
    const parsed = aiBudgetConfigSchema.parse(config)
    return this.deps.budgetRepo.upsert(parsed)
  }

  private async disableNonCriticalFeatures(yearMonth: YearMonth): Promise<void> {
    // 並列で機能停止を行い、フラグ永続化も更新する。
    await Promise.all(
      this.deps.nonCriticalFeatures.map((feature) => this.deps.flagStore.disable(feature)),
    )
    await this.deps.budgetRepo.setNonCriticalDisabled(yearMonth, true)
  }

  private async recordAudit(evaluation: BudgetEvaluation): Promise<void> {
    const auditLogger = this.deps.auditLogger
    if (!auditLogger) return
    // clock は将来の時刻記録拡張のためのフック。現状は参照のみ。
    const _now = this.deps.clock()
    void _now
    await auditLogger.emit({
      userId: null,
      action: 'AI_BUDGET_THRESHOLD_REACHED',
      resourceType: 'SYSTEM_CONFIG',
      resourceId: evaluation.yearMonth,
      ipAddress: 'system',
      userAgent: 'ai-budget-service',
      before: null,
      after: {
        level: evaluation.level,
        utilizationPct: evaluation.utilizationPct,
        currentCostUsd: evaluation.currentCostUsd,
        budgetUsd: evaluation.budgetUsd,
      },
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createAIBudgetService(deps: {
  costQuery: BudgetCostQueryPort
  budgetRepo: AIBudgetRepository
  flagStore: FeatureFlagStore
  notifier: AIAlertNotifier
  auditLogger?: BudgetAuditLogPort
  nonCriticalFeatures?: readonly NonCriticalFeature[]
  clock?: () => Date
}): AIBudgetService {
  return new DefaultAIBudgetService({
    costQuery: deps.costQuery,
    budgetRepo: deps.budgetRepo,
    flagStore: deps.flagStore,
    notifier: deps.notifier,
    auditLogger: deps.auditLogger,
    nonCriticalFeatures: deps.nonCriticalFeatures ?? NON_CRITICAL_FEATURES,
    clock: deps.clock ?? (() => new Date()),
  })
}
