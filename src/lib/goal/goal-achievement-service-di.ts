/**
 * Issue #46 / Task 13.5: GoalAchievementService DI コンテナ
 *
 * テストでは setGoalAchievementServiceForTesting() を使用。
 * プロダクションではサーバー起動前に initGoalAchievementService() を呼ぶ。
 */
import type { GoalAchievementService } from './goal-achievement-service'

let _service: GoalAchievementService | null = null

export function setGoalAchievementServiceForTesting(svc: GoalAchievementService): void {
  _service = svc
}

export function clearGoalAchievementServiceForTesting(): void {
  _service = null
}

export function getGoalAchievementService(): GoalAchievementService {
  if (_service) return _service
  throw new Error(
    'GoalAchievementService is not initialized. ' +
      'テストでは setGoalAchievementServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initGoalAchievementService() を呼んでください。',
  )
}

export function initGoalAchievementService(svc: GoalAchievementService): void {
  _service = svc
}
