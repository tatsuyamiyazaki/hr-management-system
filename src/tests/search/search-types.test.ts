/**
 * Issue #33 / Task 10.1: search-types の単体テスト
 *
 * 型定数・デフォルト値の検証
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SEARCH_LIMIT,
  EMPLOYEE_STATUSES,
  MAX_SEARCH_LIMIT,
} from '@/lib/search/search-types'

describe('search-types', () => {
  it('EMPLOYEE_STATUSES に 4 つのステータスが含まれる', () => {
    expect(EMPLOYEE_STATUSES).toEqual(['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'PENDING_JOIN'])
  })

  it('DEFAULT_SEARCH_LIMIT は 20', () => {
    expect(DEFAULT_SEARCH_LIMIT).toBe(20)
  })

  it('MAX_SEARCH_LIMIT は 100', () => {
    expect(MAX_SEARCH_LIMIT).toBe(100)
  })
})
