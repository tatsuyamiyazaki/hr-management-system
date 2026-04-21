import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET } = await import('@/app/api/organization/my-team/route')

function makeSession(role: string, userId = 'manager-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/organization/my-team', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns development fallback data for manager role', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH_BYPASS', 'true')
    vi.stubEnv('DEV_AUTH_USER_ID', 'manager-1')
    vi.stubEnv('DEV_AUTH_ROLE', 'MANAGER')
    mockedGetServerSession.mockResolvedValue(makeSession('MANAGER', 'manager-1'))

    const res = await GET()
    const body = (await res.json()) as {
      managerId: string
      directReports: readonly unknown[]
    }

    expect(res.status).toBe(200)
    expect(body.managerId).toBe('manager-1')
    expect(body.directReports.length).toBeGreaterThan(0)
  })

  it('returns 403 for unsupported roles', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEV_AUTH_BYPASS', 'false')
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE', 'employee-1'))

    const res = await GET()

    expect(res.status).toBe(403)
  })
})
