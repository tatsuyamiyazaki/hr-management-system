/**
 * Issue #33 / Task 10.1: SearchService DI モジュールのテスト
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  setSearchServiceForTesting,
  clearSearchServiceForTesting,
  getSearchService,
  initSearchService,
} from '@/lib/search/search-service-di'
import type { SearchService } from '@/lib/search/search-service'
import type { EmployeeSearchResult } from '@/lib/search/search-types'

const mockService: SearchService = {
  queryEmployees: async () => [] as EmployeeSearchResult[],
}

describe('search-service-di', () => {
  beforeEach(() => {
    clearSearchServiceForTesting()
  })

  it('未初期化時に getSearchService() が例外をスローする', () => {
    expect(() => getSearchService()).toThrow('SearchService is not initialized')
  })

  it('setSearchServiceForTesting() で設定した後に getSearchService() が返す', () => {
    setSearchServiceForTesting(mockService)
    expect(getSearchService()).toBe(mockService)
  })

  it('initSearchService() で初期化した後に getSearchService() が返す', () => {
    initSearchService(mockService)
    expect(getSearchService()).toBe(mockService)
  })

  it('clearSearchServiceForTesting() でリセットされる', () => {
    setSearchServiceForTesting(mockService)
    clearSearchServiceForTesting()
    expect(() => getSearchService()).toThrow('SearchService is not initialized')
  })
})
