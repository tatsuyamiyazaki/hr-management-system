/**
 * Issue #44 / Task 13.3: GoalProgressService DI モジュール (Req 6.6, 6.7)
 */
import type { GoalProgressService } from './goal-progress-service'

let _goalProgressService: GoalProgressService | null = null

export function setGoalProgressServiceForTesting(svc: GoalProgressService): void {
  _goalProgressService = svc
}

export function clearGoalProgressServiceForTesting(): void {
  _goalProgressService = null
}

export function getGoalProgressService(): GoalProgressService {
  if (_goalProgressService) return _goalProgressService
  throw new Error(
    'GoalProgressService is not initialized. ' +
      'テストでは setGoalProgressServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initGoalProgressService() を呼んでください。',
  )
}

export function initGoalProgressService(svc: GoalProgressService): void {
  _goalProgressService = svc
}
