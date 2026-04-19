/**
 * Issue #47 / Task 14.1: OneOnOneSessionService DI コンテナ
 *
 * テストでは setOneOnOneSessionServiceForTesting() を使用。
 * プロダクションでは initOneOnOneSessionService() をサーバー起動前に呼ぶ。
 */
import type { OneOnOneSessionService } from './one-on-one-session-service'

let _service: OneOnOneSessionService | null = null

export function setOneOnOneSessionServiceForTesting(svc: OneOnOneSessionService): void {
  _service = svc
}

export function clearOneOnOneSessionServiceForTesting(): void {
  _service = null
}

export function getOneOnOneSessionService(): OneOnOneSessionService {
  if (_service) return _service
  throw new Error(
    'OneOnOneSessionService is not initialized. ' +
      'テストでは setOneOnOneSessionServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initOneOnOneSessionService() を呼んでください。',
  )
}

export function initOneOnOneSessionService(svc: OneOnOneSessionService): void {
  _service = svc
}
