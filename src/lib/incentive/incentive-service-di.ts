/**
 * Issue #64 / Task 18.1: IncentiveService DI シングルトン
 *
 * - テスト: setIncentiveServiceForTesting / clearIncentiveServiceForTesting で差し替え
 * - プロダクション: アプリ起動時に initIncentiveService を呼んで初期化
 */
import type { IncentiveService } from './incentive-types'

let _service: IncentiveService | null = null

export function initIncentiveService(service: IncentiveService): void {
  _service = service
}

export function getIncentiveService(): IncentiveService {
  if (_service) return _service
  throw new Error(
    'IncentiveService is not initialized. ' +
      'テストでは setIncentiveServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initIncentiveService() を呼んでください。',
  )
}

export function setIncentiveServiceForTesting(service: IncentiveService): void {
  _service = service
}

export function clearIncentiveServiceForTesting(): void {
  _service = null
}
