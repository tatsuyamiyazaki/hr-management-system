import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDashboardServiceForTesting,
  setDashboardServiceForTesting,
} from '@/lib/dashboard/dashboard-service-di'
import type { DashboardService } from '@/lib/dashboard/dashboard-types'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET } = await import('@/app/api/dashboard/trends/route')

function makeSession(role: string, userId = 'user-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

function makeService(overrides?: Partial<DashboardService>): DashboardService {
  return {
    getKpiSummary: vi.fn(),
    getTrendSummary: vi.fn().mockResolvedValue({
      role: 'HR_MANAGER',
      scopeUserId: 'user-1',
      filters: {
        departmentIds: ['dept-1'],
        cycleIds: ['cycle-1'],
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-03-31T23:59:59.999Z'),
      },
      points: [],
      emptyStateMessage: null,
    }),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearDashboardServiceForTesting()
})

describe('GET /api/dashboard/trends', () => {
  it('未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await GET(new Request('http://localhost/api/dashboard/trends'))

    expect(res.status).toBe(401)
  })

  it('query を parse して trend service に渡す', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    const service = makeService()
    setDashboardServiceForTesting(service)

    const res = await GET(
      new Request(
        'http://localhost/api/dashboard/trends?departmentIds=dept-1,dept-2&cycleIds=cycle-1&from=2026-01-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z',
      ),
    )

    expect(res.status).toBe(200)
    expect(service.getTrendSummary).toHaveBeenCalledWith('HR_MANAGER', 'hr-1', {
      departmentIds: ['dept-1', 'dept-2'],
      cycleIds: ['cycle-1'],
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-31T23:59:59.999Z'),
    })
  })

  it('不正な期間は 400', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN', 'admin-1'))
    setDashboardServiceForTesting(makeService())

    const res = await GET(
      new Request(
        'http://localhost/api/dashboard/trends?from=2026-04-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z',
      ),
    )

    expect(res.status).toBe(400)
  })
})
