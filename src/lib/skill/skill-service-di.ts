/**
 * Issue #36 / Task 11.2: SkillService のシングルトン DI モジュール。
 * master-service-di.ts と同一パターン。
 */
import type { SkillService } from './skill-service'

let _skillService: SkillService | null = null

export function setSkillServiceForTesting(svc: SkillService): void {
  _skillService = svc
}

export function clearSkillServiceForTesting(): void {
  _skillService = null
}

export function getSkillService(): SkillService {
  if (_skillService) return _skillService
  throw new Error(
    'SkillService is not initialized. ' +
      'テストでは setSkillServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initSkillService() を呼んでください。',
  )
}

export function initSkillService(svc: SkillService): void {
  _skillService = svc
}
