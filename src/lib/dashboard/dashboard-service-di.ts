import type { DashboardService } from './dashboard-types'

let service: DashboardService | null = null

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
  if (!service) {
    throw new Error(
      'DashboardService is not initialized. ' +
        'テストでは setDashboardServiceForTesting() を呼び出してください。' +
        'プロダクションでは initDashboardService() を呼び出してください。',
    )
  }
  return service
}
