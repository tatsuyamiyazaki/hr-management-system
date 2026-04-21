export type AppSession =
  | (Record<string, unknown> & {
      user?: Record<string, unknown>
    })
  | null

type LegacySessionGetter = () => Promise<AppSession>

function isDevelopmentAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    (process.env.DEV_AUTH_BYPASS === 'true' || process.env.DEV_AUTH_BYPASS === '1')
  )
}

function getDevelopmentSession(): AppSession {
  return {
    user: {
      email: process.env.DEV_AUTH_EMAIL ?? 'dev-admin@example.com',
      name: process.env.DEV_AUTH_NAME ?? 'Development User',
    },
    userId: process.env.DEV_AUTH_USER_ID ?? 'dev-user-1',
    sessionId: process.env.DEV_AUTH_SESSION_ID ?? 'dev-session-1',
    role: process.env.DEV_AUTH_ROLE ?? 'ADMIN',
  }
}

function getLegacySessionGetter(): LegacySessionGetter | undefined {
  return undefined
}

async function getLegacySessionGetterForTest(): Promise<LegacySessionGetter | undefined> {
  if (process.env.NODE_ENV !== 'test') return undefined
  const NextAuthModule = (await import('next-auth')) as { getServerSession?: unknown }
  const maybeGetter = (NextAuthModule as { getServerSession?: unknown }).getServerSession
  return typeof maybeGetter === 'function' ? (maybeGetter as LegacySessionGetter) : undefined
}

export async function getAppSession(): Promise<AppSession> {
  if (isDevelopmentAuthBypassEnabled()) {
    return getDevelopmentSession()
  }

  const legacyGetter = getLegacySessionGetter() ?? (await getLegacySessionGetterForTest())
  if (legacyGetter) {
    return legacyGetter()
  }

  const { auth } = await import('@/auth')
  return auth() as Promise<AppSession>
}
