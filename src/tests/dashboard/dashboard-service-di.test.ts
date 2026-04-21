import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearDashboardServiceForTesting } from '@/lib/dashboard/dashboard-service-di'

afterEach(() => {
  clearDashboardServiceForTesting()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('dashboard-service-di', () => {
  it('returns development fallback service when auth bypass is enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH_BYPASS', 'true')

    const { getDashboardService: loadService } =
      await import('@/lib/dashboard/dashboard-service-di')
    const service = loadService()
    const summary = await service.getKpiSummary('ADMIN', 'dev-user-1')

    expect(summary.metrics.length).toBeGreaterThan(0)
    expect(summary.role).toBe('ADMIN')
  })

  it('throws when service is not initialized outside development fallback', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEV_AUTH_BYPASS', 'false')

    const { getDashboardService: loadService } =
      await import('@/lib/dashboard/dashboard-service-di')

    expect(() => loadService()).toThrow('DashboardService is not initialized')
  })
})
