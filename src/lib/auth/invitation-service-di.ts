/**
 * Task 6.5: InvitationService のシングルトン DI モジュール。
 * auth-service-di.ts と同パターン。
 */
import type { InvitationService } from './invitation-service'

let _invitationService: InvitationService | null = null

export function setInvitationServiceForTesting(svc: InvitationService): void {
  _invitationService = svc
}

export function clearInvitationServiceForTesting(): void {
  _invitationService = null
}

export function getInvitationService(): InvitationService {
  if (_invitationService) return _invitationService
  throw new Error(
    'InvitationService is not initialized. ' +
      'テストでは setInvitationServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initInvitationService() を呼んでください。',
  )
}

export function initInvitationService(svc: InvitationService): void {
  _invitationService = svc
}
