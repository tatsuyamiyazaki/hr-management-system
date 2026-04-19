/**
 * Issue #41: CareerAggregateService のシングルトン DI モジュール。
 */
import type { CareerAggregateService } from './career-aggregate-service'

let _service: CareerAggregateService | null = null

export function setCareerAggregateServiceForTesting(svc: CareerAggregateService): void {
  _service = svc
}

export function clearCareerAggregateServiceForTesting(): void {
  _service = null
}

export function initCareerAggregateService(svc: CareerAggregateService): void {
  _service = svc
}

export function getCareerAggregateService(): CareerAggregateService {
  if (_service) return _service
  throw new Error(
    'CareerAggregateService is not initialized. ' +
      'テストでは setCareerAggregateServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initCareerAggregateService() を呼んでください。',
  )
}
