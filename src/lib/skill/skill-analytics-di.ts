/**
 * Issue #37: SkillAnalyticsService のシングルトン DI モジュール。
 *
 * master-service-di.ts と同一パターン。テストでは set/clear で差し替え、
 * プロダクションでは init* で注入する。
 */
import { createDevelopmentSkillAnalyticsService } from './skill-analytics-dev-service'
import type { SkillAnalyticsService } from './skill-analytics-service'

let _service: SkillAnalyticsService | null = null

function isDevelopmentSkillAnalyticsFallbackEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false
  }

  return process.env.DEV_AUTH_BYPASS === 'true' || process.env.DEV_AUTH_BYPASS === '1'
}

export function setSkillAnalyticsServiceForTesting(svc: SkillAnalyticsService): void {
  _service = svc
}

export function clearSkillAnalyticsServiceForTesting(): void {
  _service = null
}

export function initSkillAnalyticsService(svc: SkillAnalyticsService): void {
  _service = svc
}

export function getSkillAnalyticsService(): SkillAnalyticsService {
  if (!_service && isDevelopmentSkillAnalyticsFallbackEnabled()) {
    _service = createDevelopmentSkillAnalyticsService()
  }

  if (_service) return _service
  throw new Error(
    'SkillAnalyticsService is not initialized. ' +
      'テストでは setSkillAnalyticsServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initSkillAnalyticsService() を呼んでください。',
  )
}
