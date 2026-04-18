/**
 * Issue #34 / Req 16.3, 16.4, 16.5: 検索型定義の単体テスト
 *
 * employeeSearchQuerySchema の Zod バリデーションを検証する:
 * - デフォルト値の適用 (statuses: ['ACTIVE'], limit: 20)
 * - フィルタの受け入れ
 * - 不正入力の拒否
 */
import { describe, it, expect } from 'vitest'
import {
  employeeSearchQuerySchema,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SEARCH_STATUSES,
  MAX_SEARCH_LIMIT,
  SEARCH_RATE_LIMIT_MAX,
  SEARCH_RATE_LIMIT_WINDOW_SEC,
} from '@/lib/search/search-types'

describe('employeeSearchQuerySchema', () => {
  it('最小限の入力でデフォルト値が適用される', () => {
    const result = employeeSearchQuerySchema.parse({ keyword: '山田' })

    expect(result.keyword).toBe('山田')
    expect(result.statuses).toEqual([...DEFAULT_SEARCH_STATUSES])
    expect(result.limit).toBe(DEFAULT_SEARCH_LIMIT)
    expect(result.departmentIds).toBeUndefined()
    expect(result.roleIds).toBeUndefined()
  })

  it('デフォルトの statuses は ACTIVE のみ (Req 16.5: 退職/休職除外)', () => {
    const result = employeeSearchQuerySchema.parse({ keyword: 'test' })
    expect(result.statuses).toEqual(['ACTIVE'])
  })

  it('statuses を明示的に指定すると退職者を含められる', () => {
    const result = employeeSearchQuerySchema.parse({
      keyword: 'test',
      statuses: ['ACTIVE', 'RESIGNED', 'ON_LEAVE'],
    })

    expect(result.statuses).toEqual(['ACTIVE', 'RESIGNED', 'ON_LEAVE'])
  })

  it('部署フィルタを受け取れる (Req 16.3)', () => {
    const result = employeeSearchQuerySchema.parse({
      keyword: '太郎',
      departmentIds: ['dept-1', 'dept-2'],
    })

    expect(result.departmentIds).toEqual(['dept-1', 'dept-2'])
  })

  it('役職フィルタを受け取れる (Req 16.3)', () => {
    const result = employeeSearchQuerySchema.parse({
      keyword: '太郎',
      roleIds: ['role-eng'],
    })

    expect(result.roleIds).toEqual(['role-eng'])
  })

  it('limit のカスタム値を受け取れる', () => {
    const result = employeeSearchQuerySchema.parse({
      keyword: 'test',
      limit: 50,
    })

    expect(result.limit).toBe(50)
  })

  it('keyword が空文字の場合バリデーションエラー', () => {
    expect(() => employeeSearchQuerySchema.parse({ keyword: '' })).toThrow()
  })

  it('keyword が 200 文字を超える場合バリデーションエラー', () => {
    expect(() => employeeSearchQuerySchema.parse({ keyword: 'x'.repeat(201) })).toThrow()
  })

  it('limit が MAX_SEARCH_LIMIT を超える場合バリデーションエラー', () => {
    expect(() =>
      employeeSearchQuerySchema.parse({ keyword: 'test', limit: MAX_SEARCH_LIMIT + 1 }),
    ).toThrow()
  })

  it('limit が 0 の場合バリデーションエラー', () => {
    expect(() => employeeSearchQuerySchema.parse({ keyword: 'test', limit: 0 })).toThrow()
  })

  it('不正な statuses はバリデーションエラー', () => {
    expect(() =>
      employeeSearchQuerySchema.parse({ keyword: 'test', statuses: ['INVALID_STATUS'] }),
    ).toThrow()
  })

  it('departmentIds に空文字が含まれるとバリデーションエラー', () => {
    expect(() =>
      employeeSearchQuerySchema.parse({ keyword: 'test', departmentIds: [''] }),
    ).toThrow()
  })
})

describe('レート制限定数', () => {
  it('検索レート制限は 60 req/min (Req 16.6)', () => {
    expect(SEARCH_RATE_LIMIT_MAX).toBe(60)
    expect(SEARCH_RATE_LIMIT_WINDOW_SEC).toBe(60)
  })
})
