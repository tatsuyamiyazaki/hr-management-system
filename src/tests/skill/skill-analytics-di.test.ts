import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSkillAnalyticsServiceForTesting } from '@/lib/skill/skill-analytics-di'

afterEach(() => {
  clearSkillAnalyticsServiceForTesting()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('skill-analytics-di', () => {
  it('returns development fallback service when auth bypass is enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH_BYPASS', 'true')

    const { getSkillAnalyticsService } = await import('@/lib/skill/skill-analytics-di')
    const service = getSkillAnalyticsService()
    const summary = await service.getOrganizationSummary()

    expect(summary.totalEmployees).toBeGreaterThan(0)
    expect(summary.totalSkillEntries).toBeGreaterThan(0)
  })

  it('throws when service is not initialized outside development fallback', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEV_AUTH_BYPASS', 'false')

    const { getSkillAnalyticsService } = await import('@/lib/skill/skill-analytics-di')

    expect(() => getSkillAnalyticsService()).toThrow('SkillAnalyticsService is not initialized')
  })
})
