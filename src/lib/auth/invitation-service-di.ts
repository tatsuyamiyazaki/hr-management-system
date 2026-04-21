import type { InvitationService } from './invitation-service'
import { getDevInvitationService } from './invitation-dev-service'

let invitationService: InvitationService | null = null

export function setInvitationServiceForTesting(svc: InvitationService): void {
  invitationService = svc
}

export function clearInvitationServiceForTesting(): void {
  invitationService = null
}

export function initInvitationService(svc: InvitationService): void {
  invitationService = svc
}

export function getInvitationService(): InvitationService {
  if (invitationService) {
    return invitationService
  }
  if (process.env.NODE_ENV === 'development') {
    return getDevInvitationService()
  }
  throw new Error(
    'InvitationService is not initialized. ' +
      'テストでは setInvitationServiceForTesting() を呼んでください。' +
      'プロダクションでは initInvitationService() を呼んでください。',
  )
}
