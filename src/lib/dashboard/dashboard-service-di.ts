import { createDevelopmentDashboardService } from './dashboard-dev-service'
import type { DashboardService } from './dashboard-types'

let service: DashboardService | null = null

function isDevelopmentDashboardFallbackEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false
  }

  return process.env.DEV_AUTH_BYPASS === 'true' || process.env.DEV_AUTH_BYPASS === '1'
}

export function setDashboardServiceForTesting(svc: DashboardService): void {
  service = svc
}

export function clearDashboardServiceForTesting(): void {
  service = null
}

export function initDashboardService(svc: DashboardService): void {
  service = svc
}

export function getDashboardService(): DashboardService {
  if (!service && isDevelopmentDashboardFallbackEnabled()) {
    service = createDevelopmentDashboardService()
  }

  if (!service) {
    throw new Error(
      'DashboardService is not initialized. ' +
        'テストでは setDashboardServiceForTesting() を呼び出してください。' +
        'プロダクションでは initDashboardService() を呼び出してください。',
    )
  }
  return service
}
