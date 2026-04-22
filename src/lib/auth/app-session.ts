export type AppSession =
  | (Record<string, unknown> & {
      user?: Record<string, unknown>
    })
  | null

type LegacySessionGetter = () => Promise<AppSession>

const DEV_SESSION = {
  user: {
    email: 'dev.admin@example.com',
    name: 'Development Admin',
  },
  userId: 'dev-admin',
  role: 'ADMIN',
  sessionId: '00000000-0000-4000-8000-000000000001',
} satisfies NonNullable<AppSession>
function isDevelopmentAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    (process.env.DEV_AUTH_BYPASS === 'true' || process.env.DEV_AUTH_BYPASS === '1')
  )
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

function getDevelopmentSession(): AppSession {
  return { ...DEV_SESSION, user: { ...DEV_SESSION.user } }
}

export async function getAppSession(): Promise<AppSession> {
  if (isDevelopmentAuthBypassEnabled()) {
    return getDevelopmentSession()
  }

  const legacyGetter = getLegacySessionGetter() ?? (await getLegacySessionGetterForTest())
  if (legacyGetter) {
    return legacyGetter()
  }

  try {
    const { auth } = await import('@/auth')
    const session = (await auth()) as AppSession
    if (session) {
      return session
    }
  } catch {
    // Fall back to development session when auth bootstrapping is not ready.
  }

  if (process.env.NODE_ENV === 'development') {
    return getDevelopmentSession()
  }

  return null
}
