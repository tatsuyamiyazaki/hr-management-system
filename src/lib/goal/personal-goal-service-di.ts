/**
 * Issue #43 / Task 13.2: PersonalGoalService DI コンテナ
 *
 * テストでは setPersonalGoalServiceForTesting() を使用。
 * プロダクションでは initPersonalGoalService() を起動前に呼ぶ。
 */
import type { PersonalGoalService } from './personal-goal-service'

let _service: PersonalGoalService | null = null

export function setPersonalGoalServiceForTesting(svc: PersonalGoalService): void {
  _service = svc
}

export function clearPersonalGoalServiceForTesting(): void {
  _service = null
}

export function getPersonalGoalService(): PersonalGoalService {
  if (_service) return _service
  throw new Error(
    'PersonalGoalService is not initialized. ' +
      'テストでは setPersonalGoalServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initPersonalGoalService() を呼んでください。',
  )
}

export function initPersonalGoalService(svc: PersonalGoalService): void {
  _service = svc
}
