/**
 * Issue #40: CareerMapService のシングルトン DI モジュール。
 */
import type { CareerMapService } from './career-map-service'

let _service: CareerMapService | null = null

export function setCareerMapServiceForTesting(svc: CareerMapService): void {
  _service = svc
}

export function clearCareerMapServiceForTesting(): void {
  _service = null
}

export function initCareerMapService(svc: CareerMapService): void {
  _service = svc
}

export function getCareerMapService(): CareerMapService {
  if (_service) return _service
  throw new Error(
    'CareerMapService is not initialized. ' +
      'テストでは setCareerMapServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initCareerMapService() を呼んでください。',
  )
}
