/**
 * Issue #38: PostCandidateService のシングルトン DI モジュール。
 *
 * skill-service-di.ts と同一パターン。テストでは set/clear で差し替え、
 * プロダクションでは init* で注入する。
 */
import type { PostCandidateService } from './post-candidate-service'

let _service: PostCandidateService | null = null

export function setPostCandidateServiceForTesting(svc: PostCandidateService): void {
  _service = svc
}

export function clearPostCandidateServiceForTesting(): void {
  _service = null
}

export function initPostCandidateService(svc: PostCandidateService): void {
  _service = svc
}

export function getPostCandidateService(): PostCandidateService {
  if (_service) return _service
  throw new Error(
    'PostCandidateService is not initialized. ' +
      'テストでは setPostCandidateServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initPostCandidateService() を呼んでください。',
  )
}
