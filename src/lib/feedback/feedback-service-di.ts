/**
 * Issue #55 / Task 17.1: FeedbackService DI シングルトン
 *
 * - テスト: setFeedbackServiceForTesting / clearFeedbackServiceForTesting で差し替え
 * - プロダクション: アプリ起動時に initFeedbackService を呼んで初期化
 */
import type { FeedbackService } from './feedback-types'

let _service: FeedbackService | null = null

export function initFeedbackService(service: FeedbackService): void {
  _service = service
}

export function getFeedbackService(): FeedbackService {
  if (_service) return _service
  throw new Error(
    'FeedbackService is not initialized. ' +
      'テストでは setFeedbackServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initFeedbackService() を呼んでください。',
  )
}

export function setFeedbackServiceForTesting(service: FeedbackService): void {
  _service = service
}

export function clearFeedbackServiceForTesting(): void {
  _service = null
}
