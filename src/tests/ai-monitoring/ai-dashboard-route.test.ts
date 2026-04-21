import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAIDashboardServiceForTesting,
  setAIDashboardServiceForTesting,
} from '@/lib/ai-monitoring/ai-dashboard-service-di'
import type { AIDashboardService } from '@/lib/ai-monitoring/ai-dashboard-service'
import { AIDashboardForbiddenError } from '@/lib/ai-monitoring/ai-dashboard-service'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET } = await import('@/app/api/ai-monitoring/dashboard/route')

function makeSession(role: string) {
  return {
    user: { email: 'admin@example.com' },
    userId: 'dev-admin',
    role,
  }
}

function makeService(): AIDashboardService {
  return {
    getSnapshot: vi.fn().mockResolvedValue({
      range: {
        from: new Date('2026-04-01T00:00:00.000Z'),
        to: new Date('2026-04-21T00:00:00.000Z'),
        granularity: 'DAY',
      },
      costSeries: { granularity: 'DAY', points: [] },
      topUsers: [],
      failureRate: {
        totalAttempts: 10,
        failureCount: 1,
        failureRate: 0.1,
        byErrorCategory: { TIMEOUT: 1 },
      },
      providerComparison: {
        period: {
          from: new Date('2026-04-01T00:00:00.000Z'),
          to: new Date('2026-04-21T00:00:00.000Z'),
        },
        rows: [],
      },
    }),
    getProviderComparison: vi.fn(),
    getFailureRate: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearAIDashboardServiceForTesting()
})

describe('GET /api/ai-monitoring/dashboard', () => {
  it('returns 401 without session', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/ai-monitoring/dashboard'))
    expect(res.status).toBe(401)
  })

  it('returns dashboard data for admin', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    const service = makeService()
    setAIDashboardServiceForTesting(service)

    const res = await GET(new Request('http://localhost/api/ai-monitoring/dashboard?range=30d'))
    expect(res.status).toBe(200)
    expect(service.getSnapshot).toHaveBeenCalledOnce()
  })

  it('returns 403 for forbidden role', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    const service = makeService()
    vi.mocked(service.getSnapshot).mockRejectedValue(new AIDashboardForbiddenError('EMPLOYEE'))
    setAIDashboardServiceForTesting(service)

    const res = await GET(new Request('http://localhost/api/ai-monitoring/dashboard'))
    expect(res.status).toBe(403)
  })
})
