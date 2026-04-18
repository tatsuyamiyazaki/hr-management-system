/**
 * Issue #35 / Task 11.1: 共有 SkillGapCalculator のテスト
 *
 * 純関数なので DB もモックも不要。入力配列 → 出力の変換を網羅的に検証する。
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HIRING_ALERT_THRESHOLD,
  calculateFulfillmentRate,
  calculateGap,
  isHiringAlertNeeded,
  type EmployeeSkill,
} from '@/lib/shared/skill-gap-calculator'

// ─────────────────────────────────────────────────────────────────────────────
// テストフィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

const USER_ID = 'user_001'
const FIXED_ACQUIRED_AT = new Date('2026-04-01T00:00:00.000Z')
const FIXED_APPROVED_AT = new Date('2026-04-05T12:34:56.000Z')

function makeHolderSkill(skillId: string, level: number, approved = true): EmployeeSkill {
  return {
    id: `emp_skill_${skillId}`,
    userId: USER_ID,
    skillId,
    level,
    acquiredAt: FIXED_ACQUIRED_AT,
    approvedByManagerId: approved ? 'mgr_010' : null,
    approvedAt: approved ? FIXED_APPROVED_AT : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateGap
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateGap', () => {
  it('全スキルが必要レベル以上の場合は空配列を返す（全充足）', () => {
    const gaps = calculateGap({
      holderSkills: [
        makeHolderSkill('ts', 5),
        makeHolderSkill('react', 4),
        makeHolderSkill('sql', 3),
      ],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 3 },
        { skillId: 'react', requiredLevel: 4 },
        { skillId: 'sql', requiredLevel: 3 },
      ],
    })
    expect(gaps).toEqual([])
  })

  it('部分不足のスキルのみを返し、充足済みスキルは含まない', () => {
    const gaps = calculateGap({
      holderSkills: [makeHolderSkill('ts', 5), makeHolderSkill('react', 2)],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 3, skillName: 'TypeScript', category: 'Language' },
        { skillId: 'react', requiredLevel: 4, skillName: 'React', category: 'Framework' },
      ],
    })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toEqual({
      skillId: 'react',
      skillName: 'React',
      category: 'Framework',
      currentLevel: 2,
      requiredLevel: 4,
      gap: 2,
    })
  })

  it('未保有スキルは currentLevel=0, gap=requiredLevel として含まれる', () => {
    const gaps = calculateGap({
      holderSkills: [makeHolderSkill('ts', 3)],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 3 },
        { skillId: 'kubernetes', requiredLevel: 4, skillName: 'Kubernetes', category: 'Infra' },
      ],
    })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({
      skillId: 'kubernetes',
      skillName: 'Kubernetes',
      category: 'Infra',
      currentLevel: 0,
      requiredLevel: 4,
      gap: 4,
    })
  })

  it('必要スキルが 0 件なら空配列を返す', () => {
    const gaps = calculateGap({
      holderSkills: [makeHolderSkill('ts', 5)],
      requiredSkills: [],
    })
    expect(gaps).toEqual([])
  })

  it('保有スキルが 0 件なら全必要スキルがそのまま gap として返る', () => {
    const gaps = calculateGap({
      holderSkills: [],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 3 },
        { skillId: 'sql', requiredLevel: 2 },
      ],
    })
    expect(gaps).toHaveLength(2)
    expect(gaps.map((g) => g.skillId).sort()).toEqual(['sql', 'ts'])
    for (const g of gaps) {
      expect(g.currentLevel).toBe(0)
      expect(g.gap).toBe(g.requiredLevel)
    }
  })

  it('承認済み / 未承認を区別せず両方ともレベル計算に使う（呼び出し元責務）', () => {
    const gaps = calculateGap({
      holderSkills: [
        makeHolderSkill('ts', 2, false), // 未承認でも採用
        makeHolderSkill('react', 4, true),
      ],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 3 },
        { skillId: 'react', requiredLevel: 3 },
      ],
    })
    // react は充足、ts だけ gap=1 が残る
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.skillId).toBe('ts')
    expect(gaps[0]?.gap).toBe(1)
  })

  it('ギャップは gap 降順でソートされる（Req 4.8 ランキング）', () => {
    const gaps = calculateGap({
      holderSkills: [],
      requiredSkills: [
        { skillId: 'small', requiredLevel: 1 },
        { skillId: 'huge', requiredLevel: 5 },
        { skillId: 'mid', requiredLevel: 3 },
      ],
    })
    expect(gaps.map((g) => g.skillId)).toEqual(['huge', 'mid', 'small'])
  })

  it('gap が同値なら requiredLevel 降順、さらに同値なら skillId 昇順で安定ソート', () => {
    const gaps = calculateGap({
      holderSkills: [
        makeHolderSkill('a', 2), // gap = 4 - 2 = 2
      ],
      requiredSkills: [
        { skillId: 'a', requiredLevel: 4 },
        { skillId: 'b', requiredLevel: 2 },
        { skillId: 'c', requiredLevel: 2 },
      ],
    })
    // a: gap=2 (req=4), b: gap=2 (req=2), c: gap=2 (req=2)
    // 期待順: gap=2 同値 → requiredLevel 降順 → a(req4) が先頭
    //        → b と c は req=2 同値 → skillId 昇順で b, c の順
    expect(gaps.map((g) => g.skillId)).toEqual(['a', 'b', 'c'])
  })

  it('skillName / category が未指定なら空文字で埋める', () => {
    const gaps = calculateGap({
      holderSkills: [],
      requiredSkills: [{ skillId: 'ts', requiredLevel: 3 }],
    })
    expect(gaps[0]?.skillName).toBe('')
    expect(gaps[0]?.category).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateFulfillmentRate
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateFulfillmentRate', () => {
  it('保有スキルが要件を完全に満たすなら 1.0 (100%)', () => {
    const rate = calculateFulfillmentRate({
      holderSkills: [makeHolderSkill('ts', 5), makeHolderSkill('react', 4)],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 3 },
        { skillId: 'react', requiredLevel: 4 },
      ],
    })
    expect(rate).toBe(1)
  })

  it('保有スキルがすべて未保有なら 0.0 (0%)', () => {
    const rate = calculateFulfillmentRate({
      holderSkills: [],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 3 },
        { skillId: 'react', requiredLevel: 4 },
      ],
    })
    expect(rate).toBe(0)
  })

  it('50% の充足率を正しく計算する', () => {
    // required: ts=4, react=4 → total=8
    // held:     ts=2, react=2 → fulfilled=4
    const rate = calculateFulfillmentRate({
      holderSkills: [makeHolderSkill('ts', 2), makeHolderSkill('react', 2)],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 4 },
        { skillId: 'react', requiredLevel: 4 },
      ],
    })
    expect(rate).toBe(0.5)
  })

  it('必要スキルが 0 件なら 1.0 を返す', () => {
    const rate = calculateFulfillmentRate({
      holderSkills: [makeHolderSkill('ts', 3)],
      requiredSkills: [],
    })
    expect(rate).toBe(1)
  })

  it('要件超過のレベルは要件レベル止まりで評価される（上限クリップ）', () => {
    // required: ts=3 → total=3
    // held:     ts=5 (超過) → min(5, 3) = 3 → fulfilled=3
    const rate = calculateFulfillmentRate({
      holderSkills: [makeHolderSkill('ts', 5)],
      requiredSkills: [{ skillId: 'ts', requiredLevel: 3 }],
    })
    expect(rate).toBe(1)
  })

  it('小数精度: 3 スキル中 2 スキルのみ満たす場合の比率 (≒ 0.6667)', () => {
    // required: a=3, b=3, c=3 → total=9
    // held:     a=3, b=3, c=0 → fulfilled=6
    const rate = calculateFulfillmentRate({
      holderSkills: [makeHolderSkill('a', 3), makeHolderSkill('b', 3)],
      requiredSkills: [
        { skillId: 'a', requiredLevel: 3 },
        { skillId: 'b', requiredLevel: 3 },
        { skillId: 'c', requiredLevel: 3 },
      ],
    })
    expect(rate).toBeCloseTo(6 / 9, 10)
  })

  it('結果は常に 0.0〜1.0 の範囲に収まる', () => {
    const rate = calculateFulfillmentRate({
      holderSkills: [makeHolderSkill('ts', 5), makeHolderSkill('react', 5)],
      requiredSkills: [
        { skillId: 'ts', requiredLevel: 1 },
        { skillId: 'react', requiredLevel: 1 },
      ],
    })
    expect(rate).toBeGreaterThanOrEqual(0)
    expect(rate).toBeLessThanOrEqual(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isHiringAlertNeeded
// ─────────────────────────────────────────────────────────────────────────────

describe('isHiringAlertNeeded', () => {
  it('デフォルト閾値は 0.6', () => {
    expect(DEFAULT_HIRING_ALERT_THRESHOLD).toBe(0.6)
  })

  it('デフォルト閾値未満（0.59）なら true', () => {
    expect(isHiringAlertNeeded(0.59)).toBe(true)
  })

  it('デフォルト閾値ちょうど（0.6）なら false', () => {
    expect(isHiringAlertNeeded(0.6)).toBe(false)
  })

  it('デフォルト閾値超過（0.8）なら false', () => {
    expect(isHiringAlertNeeded(0.8)).toBe(false)
  })

  it('0% 充足なら必ずアラート対象', () => {
    expect(isHiringAlertNeeded(0)).toBe(true)
  })

  it('100% 充足なら絶対にアラート対象にならない', () => {
    expect(isHiringAlertNeeded(1)).toBe(false)
  })

  it('カスタム閾値 0.8 を渡すと判定が厳しくなる', () => {
    expect(isHiringAlertNeeded(0.7, 0.8)).toBe(true)
    expect(isHiringAlertNeeded(0.8, 0.8)).toBe(false)
    expect(isHiringAlertNeeded(0.9, 0.8)).toBe(false)
  })

  it('カスタム閾値 0 を渡すと 0 以上の充足率は false', () => {
    expect(isHiringAlertNeeded(0, 0)).toBe(false)
    expect(isHiringAlertNeeded(0.01, 0)).toBe(false)
  })
})
