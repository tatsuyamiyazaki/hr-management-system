/**
 * AIBudgetRepository — 月次 AI 予算設定 (AIBudgetConfig) の永続化抽象
 *
 * Task 5.3 の範囲ではインメモリ実装のみを提供する。Prisma 実装は
 * DB スキーマ整備 (別タスク) 完了後に本リポジトリ interface を満たす形で
 * 追加する。
 *
 * 関連要件: Req 19.3, 19.4
 */
import {
  aiBudgetConfigSchema,
  yearMonthSchema,
  type AIBudgetConfig,
  type YearMonth,
} from './ai-budget-types'

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AIBudgetRepository {
  /** 指定月の予算設定を取得。未設定なら null。 */
  get(yearMonth: YearMonth): Promise<AIBudgetConfig | null>
  /** 予算設定を upsert (新規作成 or 上書き)。 */
  upsert(config: AIBudgetConfig): Promise<AIBudgetConfig>
  /**
   * 非クリティカル機能の停止フラグのみを更新。
   * 指定月の設定が存在しない場合は何もしない (no-op)。
   */
  setNonCriticalDisabled(yearMonth: YearMonth, disabled: boolean): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory implementation
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryAIBudgetRepository implements AIBudgetRepository {
  private readonly store: Map<string, AIBudgetConfig>

  constructor(seed: readonly AIBudgetConfig[] = []) {
    this.store = new Map()
    for (const config of seed) {
      const parsed = aiBudgetConfigSchema.parse(config)
      this.store.set(parsed.yearMonth, parsed)
    }
  }

  async get(yearMonth: YearMonth): Promise<AIBudgetConfig | null> {
    const key = yearMonthSchema.parse(yearMonth)
    return this.store.get(key) ?? null
  }

  async upsert(config: AIBudgetConfig): Promise<AIBudgetConfig> {
    const parsed = aiBudgetConfigSchema.parse(config)
    this.store.set(parsed.yearMonth, parsed)
    return parsed
  }

  async setNonCriticalDisabled(yearMonth: YearMonth, disabled: boolean): Promise<void> {
    const key = yearMonthSchema.parse(yearMonth)
    const current = this.store.get(key)
    if (!current) return
    // 不変性を保つため、新しいオブジェクトで差し替える
    this.store.set(key, { ...current, nonCriticalDisabled: disabled })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createInMemoryAIBudgetRepository(
  seed?: readonly AIBudgetConfig[],
): AIBudgetRepository {
  return new InMemoryAIBudgetRepository(seed)
}
