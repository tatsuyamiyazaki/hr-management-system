import type { TotalEvaluationService } from './total-evaluation-types'

let service: TotalEvaluationService | null = null

export function setTotalEvaluationServiceForTesting(svc: TotalEvaluationService): void {
  service = svc
}

export function clearTotalEvaluationServiceForTesting(): void {
  service = null
}

export function initTotalEvaluationService(svc: TotalEvaluationService): void {
  service = svc
}

export function getTotalEvaluationService(): TotalEvaluationService {
  if (!service) {
    throw new Error(
      'TotalEvaluationService is not initialized. ' +
        'テストでは setTotalEvaluationServiceForTesting() を呼んでください。' +
        'プロダクションでは initTotalEvaluationService() を呼んでください。',
    )
  }
  return service
}
