/**
 * Issue #51 / Task 15.2: ReviewCycleService DI コンテナ
 *
 * テストでは setReviewCycleServiceForTesting() を使用。
 * プロダクションでは initReviewCycleService() を起動前に呼ぶ。
 */
import type { ReviewCycleService } from './review-cycle-service'

let _service: ReviewCycleService | null = null

export function setReviewCycleServiceForTesting(svc: ReviewCycleService): void {
  _service = svc
}

export function clearReviewCycleServiceForTesting(): void {
  _service = null
}

export function getReviewCycleService(): ReviewCycleService {
  if (_service) return _service
  throw new Error(
    'ReviewCycleService is not initialized. ' +
      'テストでは setReviewCycleServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initReviewCycleService() を呼んでください。',
  )
}

export function initReviewCycleService(svc: ReviewCycleService): void {
  _service = svc
}
