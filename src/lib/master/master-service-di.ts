/**
 * Issue #24: MasterService のシングルトン DI モジュール。
 * invitation-service-di.ts と同一パターン。
 */
import type { MasterService } from './master-service'

let _masterService: MasterService | null = null

export function setMasterServiceForTesting(svc: MasterService): void {
  _masterService = svc
}

export function clearMasterServiceForTesting(): void {
  _masterService = null
}

export function getMasterService(): MasterService {
  if (_masterService) return _masterService
  throw new Error(
    'MasterService is not initialized. ' +
      'テストでは setMasterServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initMasterService() を呼んでください。',
  )
}

export function initMasterService(svc: MasterService): void {
  _masterService = svc
}
