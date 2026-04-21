import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetDevelopmentOrganizationTree } from '@/lib/organization/organization-dev-service'
import { clearOrganizationServiceForTesting } from '@/lib/organization/organization-service-di'

afterEach(() => {
  clearOrganizationServiceForTesting()
  resetDevelopmentOrganizationTree()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('organization-service-di', () => {
  it('returns development fallback service when auth bypass is enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH_BYPASS', 'true')

    const { getOrganizationService } = await import('@/lib/organization/organization-service-di')
    const service = getOrganizationService()
    const tree = await service.getCurrentTree()

    expect(tree.roots.length).toBeGreaterThan(0)
  })

  it('throws when service is not initialized outside development fallback', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEV_AUTH_BYPASS', 'false')

    const { getOrganizationService } = await import('@/lib/organization/organization-service-di')

    expect(() => getOrganizationService()).toThrow('OrganizationService is not initialized')
  })
})
