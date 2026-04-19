/**
 * Issue #53 / Task 15.4: EvaluationResponseService DI コンテナ
 *
 * テストでは setEvaluationResponseServiceForTesting() を使用。
 * プロダクションでは initEvaluationResponseService() を起動前に呼ぶ。
 */
import type { EvaluationResponseService } from './evaluation-response-service'

let _service: EvaluationResponseService | null = null

export function setEvaluationResponseServiceForTesting(svc: EvaluationResponseService): void {
  _service = svc
}

export function clearEvaluationResponseServiceForTesting(): void {
  _service = null
}

export function getEvaluationResponseService(): EvaluationResponseService {
  if (_service) return _service
  throw new Error(
    'EvaluationResponseService is not initialized. ' +
      'テストでは setEvaluationResponseServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initEvaluationResponseService() を呼んでください。',
  )
}

export function initEvaluationResponseService(svc: EvaluationResponseService): void {
  _service = svc
}
