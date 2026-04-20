/**
 * Issue #56 / Task 15.7: CycleAggregationService DI コンテナ
 */
import type { CycleAggregationService } from './cycle-aggregation-service'

let _service: CycleAggregationService | null = null

export function setCycleAggregationServiceForTesting(svc: CycleAggregationService): void {
  _service = svc
}

export function clearCycleAggregationServiceForTesting(): void {
  _service = null
}

export function getCycleAggregationService(): CycleAggregationService {
  if (_service) return _service
  throw new Error(
    'CycleAggregationService is not initialized. ' +
      'テストでは setCycleAggregationServiceForTesting() を呼んでください。',
  )
}

export function initCycleAggregationService(svc: CycleAggregationService): void {
  _service = svc
}
