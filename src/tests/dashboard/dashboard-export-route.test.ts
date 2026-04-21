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

const { POST } = await import('@/app/api/dashboard/export/route')

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
    getTrendSummary: vi.fn(),
    exportReport: vi.fn().mockResolvedValue({ jobId: 'job-dashboard-1' }),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearDashboardServiceForTesting()
})

describe('POST /api/dashboard/export', () => {
  it('未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await POST(
      new Request('http://localhost/api/dashboard/export', { method: 'POST' }) as never,
    )

    expect(res.status).toBe(401)
  })

  it('MANAGER は 403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('MANAGER', 'manager-1'))
    setDashboardServiceForTesting(makeService())

    const res = await POST(
      new Request('http://localhost/api/dashboard/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format: 'csv', cycleId: null, departmentIds: [] }),
      }) as never,
    )

    expect(res.status).toBe(403)
  })

  it('HR_MANAGER は export job を起動して 202 を返す', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    const service = makeService()
    setDashboardServiceForTesting(service)

    const res = await POST(
      new Request('http://localhost/api/dashboard/export', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.1',
          'user-agent': 'vitest',
        },
        body: JSON.stringify({
          format: 'pdf',
          cycleId: 'cycle-1',
          departmentIds: ['dept-1'],
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-03-31T23:59:59.999Z',
        }),
      }) as never,
    )

    expect(res.status).toBe(202)
    expect(service.exportReport).toHaveBeenCalledWith(
      'HR_MANAGER',
      'hr-1',
      {
        format: 'pdf',
        cycleId: 'cycle-1',
        departmentIds: ['dept-1'],
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-03-31T23:59:59.999Z'),
      },
      {
        userId: 'hr-1',
        ipAddress: '203.0.113.1',
        userAgent: 'vitest',
      },
    )
  })
})
