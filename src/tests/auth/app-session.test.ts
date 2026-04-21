import { afterEach, describe, expect, it, vi } from 'vitest'

async function importAppSessionModule() {
  vi.resetModules()
  return import('@/lib/auth/app-session')
}

describe('getAppSession', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.doUnmock('@/auth')
  })

  it('returns a development bypass session when explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH_BYPASS', 'true')
    vi.stubEnv('DEV_AUTH_ROLE', 'HR_MANAGER')
    vi.stubEnv('DEV_AUTH_USER_ID', 'dev-hr-1')
    vi.stubEnv('DEV_AUTH_EMAIL', 'hr@example.com')

    const { getAppSession } = await importAppSessionModule()
    const session = await getAppSession()

    expect(session).toMatchObject({
      user: { email: 'hr@example.com' },
      userId: 'dev-hr-1',
      role: 'HR_MANAGER',
    })
  })

  it('falls back to auth() when the development bypass is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH_BYPASS', 'false')

    vi.doMock('@/auth', () => ({
      auth: vi.fn(async () => ({
        user: { email: 'real-user@example.com' },
        userId: 'real-user-1',
        role: 'EMPLOYEE',
      })),
    }))

    const { getAppSession } = await importAppSessionModule()
    const session = await getAppSession()

    expect(session).toMatchObject({
      user: { email: 'real-user@example.com' },
      userId: 'real-user-1',
      role: 'EMPLOYEE',
    })
  })
})
