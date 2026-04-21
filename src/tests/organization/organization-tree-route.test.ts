import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearOrganizationServiceForTesting,
  setOrganizationServiceForTesting,
} from '@/lib/organization/organization-service-di'
import type { OrganizationService } from '@/lib/organization/organization-service'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET } = await import('@/app/api/organization/tree/route')

function makeSession(role: string, userId = 'hr-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

function makeService(overrides?: Partial<OrganizationService>): OrganizationService {
  return {
    getCurrentTree: vi.fn().mockResolvedValue({ roots: [], capturedAt: new Date() }),
    previewHierarchyChange: vi.fn(),
    commitHierarchyChange: vi.fn(),
    changePosition: vi.fn(),
    exportCsv: vi.fn(),
    ...overrides,
  } as OrganizationService
}

afterEach(() => {
  clearOrganizationServiceForTesting()
})

describe('GET /api/organization/tree', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns tree for HR manager', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    const service = makeService()
    setOrganizationServiceForTesting(service)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(service.getCurrentTree).toHaveBeenCalled()
  })

  it('returns 503 when service is not initialized', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN', 'admin-1'))

    const res = await GET()

    expect(res.status).toBe(503)
  })
})
