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

const { GET } = await import('@/app/api/skill-analytics/heatmap/route')

function makeSession(role: string, userId = 'user-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

function makeService(overrides?: Partial<SkillAnalyticsService>): SkillAnalyticsService {
  return {
    getOrganizationSummary: vi.fn(),
    getHeatmap: vi.fn().mockResolvedValue({
      cells: [],
      departments: ['Engineering'],
      categories: ['language'],
    }),
    getEmployeeRadar: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  clearSkillAnalyticsServiceForTesting()
})

describe('GET /api/skill-analytics/heatmap', () => {
  it('returns 200 for admin role', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN', 'admin-1'))
    const service = makeService()
    setSkillAnalyticsServiceForTesting(service)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(service.getHeatmap).toHaveBeenCalled()
  })

  it('returns 403 for employee role', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'employee-1'))
    setSkillAnalyticsServiceForTesting(makeService())

    const res = await GET()

    expect(res.status).toBe(403)
  })

  it('returns 503 when service is not initialized', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN', 'admin-1'))

    const res = await GET()

    expect(res.status).toBe(503)
  })
})
