import type { AIDashboardService } from './ai-dashboard-service'
import { getDevAIDashboardService } from './ai-dashboard-dev-service'

let service: AIDashboardService | null = null

export function setAIDashboardServiceForTesting(svc: AIDashboardService): void {
  service = svc
}

export function clearAIDashboardServiceForTesting(): void {
  service = null
}

export function initAIDashboardService(svc: AIDashboardService): void {
  service = svc
}

export function getAIDashboardService(): AIDashboardService {
  if (service) {
    return service
  }
  if (process.env.NODE_ENV === 'development') {
    return getDevAIDashboardService()
  }
  throw new Error(
    'AIDashboardService is not initialized. ' +
      'テストでは setAIDashboardServiceForTesting() を呼んでください。' +
      'プロダクションでは initAIDashboardService() を呼んでください。',
  )
}
