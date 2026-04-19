/**
 * Issue #42 / Task 13.1: OrgGoalService のシングルトン DI モジュール。
 * skill-service-di.ts と同一パターン。
 */
import type { OrgGoalService } from './org-goal-service'

let _orgGoalService: OrgGoalService | null = null

export function setOrgGoalServiceForTesting(svc: OrgGoalService): void {
  _orgGoalService = svc
}

export function clearOrgGoalServiceForTesting(): void {
  _orgGoalService = null
}

export function getOrgGoalService(): OrgGoalService {
  if (_orgGoalService) return _orgGoalService
  throw new Error(
    'OrgGoalService is not initialized. ' +
      'テストでは setOrgGoalServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initOrgGoalService() を呼んでください。',
  )
}

export function initOrgGoalService(svc: OrgGoalService): void {
  _orgGoalService = svc
}
