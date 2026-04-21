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

const { GET } = await import('@/app/api/dashboard/kpi/route')

function makeSession(role: string, userId = 'user-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

function makeService(overrides?: Partial<DashboardService>): DashboardService {
  return {
    getKpiSummary: vi.fn().mockResolvedValue({
      role: 'EMPLOYEE',
      scopeUserId: 'user-1',
      metrics: [],
      emptyStateMessage:
        'まだ表示できるデータがありません。評価、目標、スキル登録が進むとここにKPIが表示されます。',
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

describe('GET /api/dashboard/kpi', () => {
  it('未認証は401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('role と userId があれば KPI を返す', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('MANAGER', 'manager-1'))
    const service = makeService()
    setDashboardServiceForTesting(service)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(service.getKpiSummary).toHaveBeenCalledWith('MANAGER', 'manager-1')
  })

  it('role 不正は403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('UNKNOWN', 'user-1'))
    setDashboardServiceForTesting(makeService())

    const res = await GET()

    expect(res.status).toBe(403)
  })
})
