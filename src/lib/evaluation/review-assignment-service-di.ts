/**
 * Issue #52 / Task 15.3: ReviewAssignmentService DI コンテナ
 *
 * テストでは setReviewAssignmentServiceForTesting() を使用。
 * プロダクションでは initReviewAssignmentService() を起動前に呼ぶ。
 */
import type { ReviewAssignmentService } from './review-assignment-service'

let _service: ReviewAssignmentService | null = null

export function setReviewAssignmentServiceForTesting(svc: ReviewAssignmentService): void {
  _service = svc
}

export function clearReviewAssignmentServiceForTesting(): void {
  _service = null
}

export function getReviewAssignmentService(): ReviewAssignmentService {
  if (_service) return _service
  throw new Error(
    'ReviewAssignmentService is not initialized. ' +
      'テストでは setReviewAssignmentServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initReviewAssignmentService() を呼んでください。',
  )
}

export function initReviewAssignmentService(svc: ReviewAssignmentService): void {
  _service = svc
}
