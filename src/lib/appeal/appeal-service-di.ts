import type { AppealService } from './appeal-types'

let service: AppealService | null = null

export function setAppealServiceForTesting(svc: AppealService): void {
  service = svc
}

export function clearAppealServiceForTesting(): void {
  service = null
}

export function initAppealService(svc: AppealService): void {
  service = svc
}

export function getAppealService(): AppealService {
  if (!service) {
    throw new Error(
      'AppealService is not initialized. ' +
        'テストでは setAppealServiceForTesting() を呼んでください。' +
        'プロダクションでは initAppealService() を呼んでください。',
    )
  }
  return service
}
