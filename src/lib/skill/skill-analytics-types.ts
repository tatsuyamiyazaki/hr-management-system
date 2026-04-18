/**
 * Issue #37 / Req 4.1, 4.2, 4.3: スキル分析の型定義
 *
 * - SkillSummary: 組織全体サマリ (Req 4.1)
 * - SkillHeatmap: 部署 × カテゴリのヒートマップ (Req 4.2)
 * - RadarData: 社員個人のレーダーチャートデータ (Req 4.3)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** スキルレベルの最大値（レーダーチャートの外周） */
export const SKILL_LEVEL_MAX = 5
/** スキルレベルの最小値 */
export const SKILL_LEVEL_MIN = 1
/** 部署名が特定できない社員用のプレースホルダ */
export const UNASSIGNED_DEPARTMENT_ID = '__unassigned__'
export const UNASSIGNED_DEPARTMENT_NAME = '未所属'

// ─────────────────────────────────────────────────────────────────────────────
// 組織サマリ (Req 4.1)
// ─────────────────────────────────────────────────────────────────────────────

/** カテゴリ別の充足度トップエントリ */
export interface CategoryFulfillment {
  readonly category: string
  readonly fulfillmentRate: number // 0.0〜1.0
}

/** 組織全体のスキル集計 */
export interface SkillSummary {
  readonly totalEmployees: number
  readonly totalSkillEntries: number
  /** 全社員のスキルレベル平均を max=5 で正規化した値 (0.0〜1.0) */
  readonly averageFulfillmentRate: number
  /** 上位カテゴリ（充足度降順、最大 5 件） */
  readonly topCategories: readonly CategoryFulfillment[]
}

// ─────────────────────────────────────────────────────────────────────────────
// ヒートマップ (Req 4.2)
// ─────────────────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  readonly departmentId: string
  readonly departmentName: string
  readonly category: string
  /** 該当セル内の平均スキルレベル 0.0〜5.0（データが無い場合は 0） */
  readonly averageLevel: number
  /** 該当セル内で当該カテゴリを保有する社員数 */
  readonly employeeCount: number
}

export interface SkillHeatmap {
  readonly cells: readonly HeatmapCell[]
  readonly departments: readonly string[]
  readonly categories: readonly string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// レーダー (Req 4.3)
// ─────────────────────────────────────────────────────────────────────────────

export interface RadarDataPoint {
  readonly skillName: string
  readonly category: string
  readonly currentLevel: number // 0〜5
  readonly maxLevel: number // 5 固定
  /** 承認済みなら true、未承認なら false（UI の実線 / 点線切替に使用） */
  readonly approved: boolean
}

export interface RadarData {
  readonly userId: string
  readonly points: readonly RadarDataPoint[]
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

/** 空の組織サマリ（データが一件も無いときの既定値） */
export function emptySkillSummary(): SkillSummary {
  return {
    totalEmployees: 0,
    totalSkillEntries: 0,
    averageFulfillmentRate: 0,
    topCategories: [],
  }
}

/** level を 0〜1 の充足率に正規化する */
export function normalizeLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0
  if (level >= SKILL_LEVEL_MAX) return 1
  return level / SKILL_LEVEL_MAX
}
