/**
 * Issue #48 / Task 14.2: OneOnOneLogService DI モジュール (Req 7.3, 7.4, 7.5)
 */
import type { OneOnOneLogService } from './one-on-one-log-service'

let _oneOnOneLogService: OneOnOneLogService | null = null

export function setOneOnOneLogServiceForTesting(svc: OneOnOneLogService): void {
  _oneOnOneLogService = svc
}

export function clearOneOnOneLogServiceForTesting(): void {
  _oneOnOneLogService = null
}

export function getOneOnOneLogService(): OneOnOneLogService {
  if (_oneOnOneLogService) return _oneOnOneLogService
  throw new Error(
    'OneOnOneLogService is not initialized. ' +
      'テストでは setOneOnOneLogServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initOneOnOneLogService() を呼んでください。',
  )
}

export function initOneOnOneLogService(svc: OneOnOneLogService): void {
  _oneOnOneLogService = svc
}
