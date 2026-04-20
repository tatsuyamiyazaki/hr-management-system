export type AppSession =
  | (Record<string, unknown> & {
      user?: Record<string, unknown>
    })
  | null

type LegacySessionGetter = () => Promise<AppSession>

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
  const legacyGetter = getLegacySessionGetter() ?? (await getLegacySessionGetterForTest())
  if (legacyGetter) {
    return legacyGetter()
  }

  const { auth } = await import('@/auth')
  return auth() as Promise<AppSession>
}
