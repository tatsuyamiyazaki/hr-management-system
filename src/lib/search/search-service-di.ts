/**
 * Issue #34: SearchService のシングルトン DI モジュール。
 * master-service-di.ts / lifecycle-service-di.ts と同一パターン。
 */
import type { SearchService } from './search-service'

let _searchService: SearchService | null = null

export function setSearchServiceForTesting(svc: SearchService): void {
  _searchService = svc
}

export function clearSearchServiceForTesting(): void {
  _searchService = null
}

export function getSearchService(): SearchService {
  if (_searchService) return _searchService
  throw new Error(
    'SearchService is not initialized. ' +
      'テストでは setSearchServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initSearchService() を呼んでください。',
  )
}

export function initSearchService(svc: SearchService): void {
  _searchService = svc
}
