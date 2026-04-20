/**
 * Issue #55 / Task 15.6: EvaluationProgressService DI コンテナ
 *
 * テストでは setEvaluationProgressServiceForTesting() を使用。
 * プロダクションでは initEvaluationProgressService() を起動前に呼ぶ。
 */
import type { EvaluationProgressService } from './evaluation-progress-service'

let _service: EvaluationProgressService | null = null

export function setEvaluationProgressServiceForTesting(svc: EvaluationProgressService): void {
  _service = svc
}

export function clearEvaluationProgressServiceForTesting(): void {
  _service = null
}

export function getEvaluationProgressService(): EvaluationProgressService {
  if (_service) return _service
  throw new Error(
    'EvaluationProgressService is not initialized. ' +
      'テストでは setEvaluationProgressServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initEvaluationProgressService() を呼んでください。',
  )
}

export function initEvaluationProgressService(svc: EvaluationProgressService): void {
  _service = svc
}
