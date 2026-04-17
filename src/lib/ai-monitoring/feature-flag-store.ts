/**
 * FeatureFlagStore — 非クリティカル AI 機能の ON/OFF を即時反映する薄いストア。
 *
 * 予算 100% 到達時に AIBudgetService が該当機能を disable() する。
 * 復旧時 (予算再設定・月次リセット) に enable() で戻す。
 *
 * 関連要件: Req 19.4
 */
import type { NonCriticalFeature } from './ai-budget-types'

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface FeatureFlagStore {
  /** 機能が有効 (= 停止されていない) か */
  isEnabled(feature: NonCriticalFeature): Promise<boolean>
  /** 機能を停止する (idempotent) */
  disable(feature: NonCriticalFeature): Promise<void>
  /** 機能を再有効化する (idempotent) */
  enable(feature: NonCriticalFeature): Promise<void>
  /** 現在停止中の機能一覧 */
  listDisabled(): Promise<readonly NonCriticalFeature[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory implementation
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryFeatureFlagStore implements FeatureFlagStore {
  private readonly disabled: Set<NonCriticalFeature>

  constructor(seed: readonly NonCriticalFeature[] = []) {
    this.disabled = new Set(seed)
  }

  async isEnabled(feature: NonCriticalFeature): Promise<boolean> {
    return !this.disabled.has(feature)
  }

  async disable(feature: NonCriticalFeature): Promise<void> {
    this.disabled.add(feature)
  }

  async enable(feature: NonCriticalFeature): Promise<void> {
    this.disabled.delete(feature)
  }

  async listDisabled(): Promise<readonly NonCriticalFeature[]> {
    return [...this.disabled]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createInMemoryFeatureFlagStore(
  seed?: readonly NonCriticalFeature[],
): FeatureFlagStore {
  return new InMemoryFeatureFlagStore(seed)
}
