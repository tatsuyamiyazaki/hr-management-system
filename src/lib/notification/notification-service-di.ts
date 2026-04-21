import type { NotificationService } from './notification-service'
import { getDevNotificationService } from './notification-dev-service'

let service: NotificationService | null = null

export function setNotificationServiceForTesting(svc: NotificationService): void {
  service = svc
}

export function clearNotificationServiceForTesting(): void {
  service = null
}

export function initNotificationService(svc: NotificationService): void {
  service = svc
}

export function getNotificationService(): NotificationService {
  if (service) {
    return service
  }
  if (process.env.NODE_ENV === 'development') {
    return getDevNotificationService()
  }
  throw new Error(
    'NotificationService is not initialized. ' +
      'テストでは setNotificationServiceForTesting() を呼んでください。' +
      'プロダクションでは initNotificationService() を呼んでください。',
  )
}
