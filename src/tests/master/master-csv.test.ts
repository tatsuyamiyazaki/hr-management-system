/**
 * Issue #26: master-csv.ts の単体テスト
 */
import { describe, it, expect } from 'vitest'
import {
  generateGradeCsv,
  generateRoleCsv,
  generateSkillCsv,
  isMasterResource,
  parseGradeCsv,
  parseRoleCsv,
  parseSkillCsv,
} from '@/lib/master/master-csv'

// ─────────────────────────────────────────────────────────────────────────────
// parseSkillCsv
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSkillCsv()', () => {
  it('正常ケース: ヘッダー + 1 行を解釈する', () => {
    const csv = 'name,category,description\n' + 'TypeScript,programming,strongly typed JS\n'
    const { rows, errors } = parseSkillCsv(csv)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      name: 'TypeScript',
      category: 'programming',
      description: 'strongly typed JS',
    })
  })

  it('description は省略可能（空文字なら undefined 相当）', () => {
    const csv = 'name,category,description\nGo,programming,\n'
    const { rows, errors } = parseSkillCsv(csv)
    expect(errors).toEqual([])
    expect(rows[0]?.description).toBeUndefined()
  })

  it('必須フィールド欠如: name が空ならエラー', () => {
    const csv = 'name,category,description\n,programming,missing name\n'
    const { rows, errors } = parseSkillCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.field).toBe('name')
    expect(errors[0]?.rowNumber).toBe(2)
  })

  it('必須フィールド欠如: category が空白のみならエラー', () => {
    const csv = 'name,category,description\nTS,   ,desc\n'
    const { rows, errors } = parseSkillCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.some((e) => e.field === 'category')).toBe(true)
  })

  it('空行はスキップする', () => {
    const csv =
      'name,category,description\n' +
      'TypeScript,programming,desc\n' +
      '\n' +
      '   ,   ,   \n' +
      'Go,programming,desc2\n'
    const { rows, errors } = parseSkillCsv(csv)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)
  })

  it('ヘッダーが不正ならエラーで早期終了', () => {
    const csv = 'foo,bar,baz\nx,y,z\n'
    const { rows, errors } = parseSkillCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.rowNumber).toBe(1)
  })

  it('空文字入力はエラー', () => {
    const { rows, errors } = parseSkillCsv('')
    expect(rows).toHaveLength(0)
    expect(errors).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parseRoleCsv
// ─────────────────────────────────────────────────────────────────────────────

describe('parseRoleCsv()', () => {
  it('正常ケース: skillIds と requiredLevels の件数一致', () => {
    const csv =
      'name,gradeId,skillIds,requiredLevels\n' +
      '"Senior Engineer",grade-001,"skill-a,skill-b","4,3"\n'
    const { rows, errors } = parseRoleCsv(csv)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      name: 'Senior Engineer',
      gradeId: 'grade-001',
      skillIds: 'skill-a,skill-b',
      requiredLevels: '4,3',
    })
  })

  it('skillIds と requiredLevels の件数が異なるとエラー', () => {
    const csv = 'name,gradeId,skillIds,requiredLevels\n' + 'R1,g1,"a,b,c","4,3"\n'
    const { rows, errors } = parseRoleCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.some((e) => e.field === 'requiredLevels')).toBe(true)
  })

  it('requiredLevel が範囲外（6）ならエラー', () => {
    const csv = 'name,gradeId,skillIds,requiredLevels\n' + 'R1,g1,"a,b","6,3"\n'
    const { rows, errors } = parseRoleCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.some((e) => e.field === 'requiredLevels')).toBe(true)
  })

  it('requiredLevel が 0 ならエラー', () => {
    const csv = 'name,gradeId,skillIds,requiredLevels\n' + 'R1,g1,a,0\n'
    const { rows, errors } = parseRoleCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.some((e) => e.field === 'requiredLevels')).toBe(true)
  })

  it('requiredLevel が整数でない（2.5）ならエラー', () => {
    const csv = 'name,gradeId,skillIds,requiredLevels\n' + 'R1,g1,a,2.5\n'
    const { rows, errors } = parseRoleCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.some((e) => e.field === 'requiredLevels')).toBe(true)
  })

  it('name や gradeId の欠如はエラー', () => {
    const csv = 'name,gradeId,skillIds,requiredLevels\n' + ',,a,3\n'
    const { rows, errors } = parseRoleCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.some((e) => e.field === 'name')).toBe(true)
    expect(errors.some((e) => e.field === 'gradeId')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parseGradeCsv
// ─────────────────────────────────────────────────────────────────────────────

describe('parseGradeCsv()', () => {
  it('ウェイト合計が 1.0 なら OK', () => {
    const csv = 'label,performanceWeight,goalWeight,feedbackWeight\n' + 'G3,0.5,0.3,0.2\n'
    const { rows, errors } = parseGradeCsv(csv)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
  })

  it('ウェイト合計が 0.9 ならエラー', () => {
    const csv = 'label,performanceWeight,goalWeight,feedbackWeight\n' + 'G3,0.5,0.3,0.1\n'
    const { rows, errors } = parseGradeCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.field).toBe('performanceWeight')
  })

  it('ウェイト合計が 1.0009（許容誤差 ±0.001 内）なら OK', () => {
    const csv = 'label,performanceWeight,goalWeight,feedbackWeight\n' + 'G3,0.5,0.3,0.2009\n'
    const { rows, errors } = parseGradeCsv(csv)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
  })

  it('ウェイトが負数ならエラー', () => {
    const csv = 'label,performanceWeight,goalWeight,feedbackWeight\n' + 'G3,-0.1,0.6,0.5\n'
    const { rows, errors } = parseGradeCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.some((e) => e.field === 'performanceWeight')).toBe(true)
  })

  it('ウェイトが 1 を超えるとエラー', () => {
    const csv = 'label,performanceWeight,goalWeight,feedbackWeight\n' + 'G3,1.5,0.0,-0.5\n'
    const { rows, errors } = parseGradeCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('label が欠如していればエラー', () => {
    const csv = 'label,performanceWeight,goalWeight,feedbackWeight\n' + ',0.5,0.3,0.2\n'
    const { rows, errors } = parseGradeCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.some((e) => e.field === 'label')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// generate* — エクスポート
// ─────────────────────────────────────────────────────────────────────────────

describe('generateSkillCsv()', () => {
  it('ヘッダー行は name,category,description で始まる', () => {
    const csv = generateSkillCsv([])
    expect(csv.split('\n')[0]).toBe('name,category,description')
  })

  it('データ行を含めて生成する', () => {
    const csv = generateSkillCsv([
      { name: 'TS', category: 'programming', description: 'typed' },
      { name: 'Go', category: 'programming', description: null },
    ])
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('TS,programming,typed')
    expect(lines[2]).toBe('Go,programming,')
  })

  it('カンマや改行を含む値はクォート&エスケープされる', () => {
    const csv = generateSkillCsv([{ name: 'a,b', category: 'c"d', description: 'line1\nline2' }])
    expect(csv).toContain('"a,b"')
    expect(csv).toContain('"c""d"')
  })

  it('round-trip: generate → parse で内容一致', () => {
    const source = [
      { name: 'TS', category: 'programming', description: 'typed' },
      { name: 'Go', category: 'programming', description: undefined },
    ] as const
    const csv = generateSkillCsv(source)
    const { rows, errors } = parseSkillCsv(csv)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]?.name).toBe('TS')
    expect(rows[1]?.description).toBeUndefined()
  })
})

describe('generateRoleCsv()', () => {
  it('ヘッダー行は name,gradeId,skillIds,requiredLevels', () => {
    const csv = generateRoleCsv([])
    expect(csv.split('\n')[0]).toBe('name,gradeId,skillIds,requiredLevels')
  })

  it('skillRequirements を skillIds/requiredLevels の 2 カラムに展開する', () => {
    const csv = generateRoleCsv([
      {
        name: 'Senior',
        gradeId: 'g-1',
        skillRequirements: [
          { skillId: 's-1', requiredLevel: 4 },
          { skillId: 's-2', requiredLevel: 3 },
        ],
      },
    ])
    expect(csv).toContain('"s-1,s-2"')
    expect(csv).toContain('"4,3"')
  })
})

describe('generateGradeCsv()', () => {
  it('ヘッダー + データ行を出力', () => {
    const csv = generateGradeCsv([
      { label: 'G3', performanceWeight: 0.5, goalWeight: 0.3, feedbackWeight: 0.2 },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('label,performanceWeight,goalWeight,feedbackWeight')
    expect(lines[1]).toBe('G3,0.5,0.3,0.2')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isMasterResource
// ─────────────────────────────────────────────────────────────────────────────

describe('isMasterResource()', () => {
  it('許可された値は true', () => {
    expect(isMasterResource('skill')).toBe(true)
    expect(isMasterResource('role')).toBe(true)
    expect(isMasterResource('grade')).toBe(true)
  })

  it('許可されない値は false', () => {
    expect(isMasterResource('Skill')).toBe(false)
    expect(isMasterResource('employee')).toBe(false)
    expect(isMasterResource('')).toBe(false)
    expect(isMasterResource(undefined)).toBe(false)
    expect(isMasterResource(42)).toBe(false)
  })
})
