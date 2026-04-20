/**
 * AICoachService のシングルトン DI モジュール。
 * search-service-di.ts / master-service-di.ts と同一パターン。
 */
import type { AICoachService } from './ai-coach-service'

let _aiCoachService: AICoachService | null = null

export function setAICoachServiceForTesting(svc: AICoachService): void {
  _aiCoachService = svc
}

export function clearAICoachServiceForTesting(): void {
  _aiCoachService = null
}

export function getAICoachService(): AICoachService {
  if (_aiCoachService) return _aiCoachService
  throw new Error(
    'AICoachService is not initialized. ' +
      'テストでは setAICoachServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initAICoachService() を呼んでください。',
  )
}

export function initAICoachService(svc: AICoachService): void {
  _aiCoachService = svc
}
