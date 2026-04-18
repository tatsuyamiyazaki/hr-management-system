/**
 * Issue #35 / Task 11.1: 共有 SkillGapCalculator
 *
 * 役職（ポジション）が要求するスキル要件と、社員が保有するスキルの差分を
 * 計算する純関数群。DB やリポジトリには一切依存しない。
 *
 * 呼び出し側（CareerService / SkillAnalytics / HR ダッシュボード）が
 * 事前に必要なデータを取得し、このモジュールへ渡すことでドメイン境界越えを排除する。
 *
 * Requirements:
 * - 4.6: HR_MANAGER が特定ポストを選択したとき、充足率(%)と候補者一覧を表示
 * - 4.7: スキル充足率が閾値（デフォルト 60%）を下回るポストを採用アラートへ
 * - 4.8: スキルギャップ分析で不足スキルカテゴリをランキング表示
 */

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** 未保有スキルのレベル */
const LEVEL_NOT_HELD = 0

/** 必要スキルが 0 件のときの充足率 */
const FULFILLMENT_RATE_WHEN_NO_REQUIREMENT = 1

/** 採用アラート判定のデフォルト閾値 (60%)（Requirement 4.7） */
export const DEFAULT_HIRING_ALERT_THRESHOLD = 0.6

/** 呼び出し元が skillName / category を渡さなかった場合の既定値 */
const UNKNOWN_SKILL_NAME = ''
const UNKNOWN_CATEGORY = ''

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 社員が保有するスキル（Prisma EmployeeSkill モデルと 1:1 対応）。
 *
 * 承認済み / 未承認の判定は呼び出し元の責務。必要ならこのモジュールへ渡す前に
 * `approvedAt !== null` 等でフィルタしておくこと。
 */
export interface EmployeeSkill {
  readonly id: string
  readonly userId: string
  readonly skillId: string
  /** 保有レベル 1〜5 */
  readonly level: number
  readonly acquiredAt: Date
  readonly approvedByManagerId: string | null
  readonly approvedAt: Date | null
}

/**
 * スキル要件 1 件に対する差分情報。
 *
 * `gap` は常に非負。完全充足または過剰保有の場合は `calculateGap` の結果から除外される。
 */
export interface SkillGap {
  readonly skillId: string
  /** 表示用の名称（呼び出し元が渡す） */
  readonly skillName: string
  /** 表示用のカテゴリ（呼び出し元が渡す） */
  readonly category: string
  /** 現在の保有レベル。未保有なら 0 */
  readonly currentLevel: number
  /** 必要レベル 1〜5 */
  readonly requiredLevel: number
  /** requiredLevel - currentLevel（0 以上） */
  readonly gap: number
}

/**
 * SkillGapCalculator 入力。
 *
 * requiredSkills は `RoleSkillRequirement` と同形だが、ドメイン層の型に依存しないよう
 * プレーンオブジェクトで受け取る。表示用の skillName / category は任意で渡せる。
 */
export interface SkillGapCalculatorInput {
  readonly holderSkills: readonly EmployeeSkill[]
  readonly requiredSkills: ReadonlyArray<{
    readonly skillId: string
    readonly requiredLevel: number
    readonly skillName?: string
    readonly category?: string
  }>
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

/**
 * holderSkills を skillId → level の Map に畳み込む。
 * 同一 skillId が重複した場合は最大レベルを採用する（防御的）。
 * Prisma 側では (userId, skillId) に UNIQUE を張っているため通常は重複しない。
 */
function buildHolderLevelMap(holderSkills: readonly EmployeeSkill[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const skill of holderSkills) {
    const existing = map.get(skill.skillId) ?? LEVEL_NOT_HELD
    if (skill.level > existing) {
      map.set(skill.skillId, skill.level)
    }
  }
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 不足スキル一覧を返す。
 *
 * - 未保有スキルは `currentLevel = 0`, `gap = requiredLevel` として含まれる
 * - 必要レベルを満たす／超えるスキルは結果に含めない（gap > 0 のみ）
 * - 結果は `gap` 降順、次に `requiredLevel` 降順、最後に `skillId` 昇順で安定ソート
 *   （Requirement 4.8: ランキング表示）
 */
export function calculateGap(input: SkillGapCalculatorInput): SkillGap[] {
  const holderLevels = buildHolderLevelMap(input.holderSkills)
  const gaps: SkillGap[] = []

  for (const req of input.requiredSkills) {
    const currentLevel = holderLevels.get(req.skillId) ?? LEVEL_NOT_HELD
    const gap = req.requiredLevel - currentLevel
    if (gap <= 0) continue

    gaps.push({
      skillId: req.skillId,
      skillName: req.skillName ?? UNKNOWN_SKILL_NAME,
      category: req.category ?? UNKNOWN_CATEGORY,
      currentLevel,
      requiredLevel: req.requiredLevel,
      gap,
    })
  }

  gaps.sort((a, b) => {
    if (b.gap !== a.gap) return b.gap - a.gap
    if (b.requiredLevel !== a.requiredLevel) return b.requiredLevel - a.requiredLevel
    return a.skillId.localeCompare(b.skillId)
  })

  return gaps
}

/**
 * 充足率を 0.0〜1.0 で返す。
 *
 * 計算式: `Σ min(currentLevel, requiredLevel) / Σ requiredLevel`
 *
 * - 必要スキルが 0 件なら 1.0（「要件なし＝完全充足」とみなす）
 * - requiredLevel が 0 以下の要件は無視する（定義上 1〜5 のはずだが防御的に除外）
 */
export function calculateFulfillmentRate(input: SkillGapCalculatorInput): number {
  const holderLevels = buildHolderLevelMap(input.holderSkills)
  let totalRequired = 0
  let totalFulfilled = 0

  for (const req of input.requiredSkills) {
    if (req.requiredLevel <= 0) continue
    const currentLevel = holderLevels.get(req.skillId) ?? LEVEL_NOT_HELD
    totalRequired += req.requiredLevel
    totalFulfilled += Math.min(currentLevel, req.requiredLevel)
  }

  if (totalRequired === 0) return FULFILLMENT_RATE_WHEN_NO_REQUIREMENT
  return totalFulfilled / totalRequired
}

/**
 * 採用アラートが必要か判定する（Requirement 4.7）。
 *
 * - 充足率が閾値を **下回る** (`<`) 場合に true
 * - 閾値ちょうどの場合は false（「60% 以上なら OK」のセマンティクス）
 * - デフォルト閾値 0.6
 */
export function isHiringAlertNeeded(
  fulfillmentRate: number,
  threshold: number = DEFAULT_HIRING_ALERT_THRESHOLD,
): boolean {
  return fulfillmentRate < threshold
}
