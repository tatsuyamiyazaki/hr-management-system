/**
 * Issue #29: LifecycleService のシングルトン DI モジュール。
 * master-service-di.ts / invitation-service-di.ts と同一パターン。
 */
import type { LifecycleService } from './lifecycle-service'

let _lifecycleService: LifecycleService | null = null

export function setLifecycleServiceForTesting(svc: LifecycleService): void {
  _lifecycleService = svc
}

export function clearLifecycleServiceForTesting(): void {
  _lifecycleService = null
}

export function getLifecycleService(): LifecycleService {
  if (_lifecycleService) return _lifecycleService
  throw new Error(
    'LifecycleService is not initialized. ' +
      'テストでは setLifecycleServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initLifecycleService() を呼んでください。',
  )
}

export function initLifecycleService(svc: LifecycleService): void {
  _lifecycleService = svc
}
