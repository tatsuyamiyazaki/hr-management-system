import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSkillAnalyticsServiceForTesting,
  setSkillAnalyticsServiceForTesting,
} from '@/lib/skill/skill-analytics-di'
import type { SkillAnalyticsService } from '@/lib/skill/skill-analytics-service'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET } = await import('@/app/api/skill-analytics/summary/route')

function makeSession(role: string, userId = 'user-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

function makeService(overrides?: Partial<SkillAnalyticsService>): SkillAnalyticsService {
  return {
    getOrganizationSummary: vi.fn().mockResolvedValue({
      totalEmployees: 3,
      totalSkillEntries: 7,
      averageFulfillmentRate: 0.72,
      topCategories: [],
    }),
    getHeatmap: vi.fn(),
    getEmployeeRadar: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  clearSkillAnalyticsServiceForTesting()
})

describe('GET /api/skill-analytics/summary', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns summary for HR manager', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    const service = makeService()
    setSkillAnalyticsServiceForTesting(service)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(service.getOrganizationSummary).toHaveBeenCalled()
  })

  it('returns 503 when service is not initialized', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN', 'admin-1'))

    const res = await GET()

    expect(res.status).toBe(503)
  })
})
