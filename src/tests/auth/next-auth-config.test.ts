/**
 * Task 6.1: NextAuth 設定ファクトリ (createNextAuthConfig) の単体テスト
 */
import { describe, it, expect, vi } from 'vitest'
import type { Provider } from 'next-auth/providers'
import type { AuthService } from '@/lib/auth/auth-service'
import { InvalidCredentialsError, type Session } from '@/lib/auth/auth-types'
import { NEXT_AUTH_SESSION_MAX_AGE_SEC, createNextAuthConfig } from '@/lib/auth/next-auth-config'

function makeSession(overrides?: Partial<Session>): Session {
  const now = new Date('2026-04-17T00:00:00.000Z')
  return {
    id: 'sess-1',
    userId: 'user-1',
    role: 'EMPLOYEE',
    email: 'alice@example.com',
    createdAt: now,
    expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
    lastAccessAt: now,
    ...overrides,
  }
}

interface AuthorizeCallback {
  (credentials: Partial<Record<string, unknown>>, request: Request): Promise<unknown>
}

interface CredentialsProviderShape {
  readonly type: 'credentials'
  /**
   * next-auth v5 の Credentials() ヘルパーは authorize を options プロパティ配下に保管する
   * (参照: node_modules/@auth/core/providers/credentials.js)
   */
  readonly options: { readonly authorize: AuthorizeCallback }
}

function extractCredentialsProvider(
  providers: readonly Provider[] | undefined,
): CredentialsProviderShape {
  if (!providers || providers.length === 0) {
    throw new Error('providers must be non-empty')
  }
  const first = providers[0] as unknown as CredentialsProviderShape
  if (
    !first ||
    first.type !== 'credentials' ||
    !first.options ||
    typeof first.options.authorize !== 'function'
  ) {
    throw new Error('expected credentials provider with authorize callback')
  }
  return first
}

describe('createNextAuthConfig', () => {
  it('session.strategy は jwt、maxAge は 8 時間', () => {
    const authService = {} as AuthService
    const config = createNextAuthConfig({ authService })
    expect(config.session?.strategy).toBe('jwt')
    expect(config.session?.maxAge).toBe(NEXT_AUTH_SESSION_MAX_AGE_SEC)
    expect(config.session?.maxAge).toBe(8 * 60 * 60)
  })

  it('pages.signIn = /login', () => {
    const authService = {} as AuthService
    const config = createNextAuthConfig({ authService })
    expect(config.pages?.signIn).toBe('/login')
  })

  it('authorize: 成功時に authService.login を呼んで user オブジェクトを返す', async () => {
    const session = makeSession()
    const authService: AuthService = {
      login: vi.fn(async () => session),
      logout: vi.fn(async () => undefined),
      getSession: vi.fn(async () => session),
      touchSession: vi.fn(async () => session),
    }
    const config = createNextAuthConfig({ authService })
    const provider = extractCredentialsProvider(config.providers)

    const request = new Request('https://example.com/api/auth/callback/credentials', {
      headers: {
        'x-forwarded-for': '192.0.2.1, 10.0.0.1',
        'user-agent': 'unit-test/1.0',
      },
    })
    const user = await provider.options.authorize(
      { email: 'alice@example.com', password: 'secret-pw' },
      request,
    )

    expect(authService.login).toHaveBeenCalledWith(
      { email: 'alice@example.com', password: 'secret-pw' },
      { ipAddress: '192.0.2.1', userAgent: 'unit-test/1.0' },
    )
    expect(user).toEqual({
      id: session.userId,
      email: session.email,
      role: session.role,
      sessionId: session.id,
    })
  })

  it('authorize: InvalidCredentialsError が throw されたら null を返す', async () => {
    const authService = {
      login: vi.fn(async () => {
        throw new InvalidCredentialsError()
      }),
      logout: vi.fn(async () => undefined),
      getSession: vi.fn(),
      touchSession: vi.fn(),
    } as unknown as AuthService

    const config = createNextAuthConfig({ authService })
    const provider = extractCredentialsProvider(config.providers)
    const request = new Request('https://example.com', {})
    const user = await provider.options.authorize(
      { email: 'x@example.com', password: 'whatever' },
      request,
    )
    expect(user).toBeNull()
  })

  it('authorize: Zod 検証に失敗したら null を返す (authService.login は呼ばない)', async () => {
    const login = vi.fn()
    const authService = {
      login,
      logout: vi.fn(),
      getSession: vi.fn(),
      touchSession: vi.fn(),
    } as unknown as AuthService

    const config = createNextAuthConfig({ authService })
    const provider = extractCredentialsProvider(config.providers)
    const request = new Request('https://example.com', {})
    const user = await provider.options.authorize({ email: 'not-an-email', password: '' }, request)
    expect(user).toBeNull()
    expect(login).not.toHaveBeenCalled()
  })

  it('authorize: 想定外の例外も null に丸める', async () => {
    const authService = {
      login: vi.fn(async () => {
        throw new Error('boom')
      }),
      logout: vi.fn(),
      getSession: vi.fn(),
      touchSession: vi.fn(),
    } as unknown as AuthService

    const config = createNextAuthConfig({ authService })
    const provider = extractCredentialsProvider(config.providers)
    const request = new Request('https://example.com', {})
    const user = await provider.options.authorize(
      { email: 'alice@example.com', password: 'pw' },
      request,
    )
    expect(user).toBeNull()
  })

  it('jwt コールバック: user が渡された時に token に sessionId/userId/role/email を追加', async () => {
    const authService = {} as AuthService
    const config = createNextAuthConfig({ authService })
    const jwt = config.callbacks?.jwt
    expect(jwt).toBeDefined()

    const token = await jwt?.({
      token: { sub: 'existing-sub' },
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        role: 'EMPLOYEE',
        sessionId: 'sess-1',
      } as unknown as never,
      account: null,
      profile: undefined,
      trigger: 'signIn' as never,
      isNewUser: false,
      session: undefined,
    } as never)
    expect(token).toMatchObject({
      sessionId: 'sess-1',
      userId: 'user-1',
      role: 'EMPLOYEE',
      email: 'alice@example.com',
    })
  })

  it('session コールバック: token の値を session 上にコピー', async () => {
    const authService = {} as AuthService
    const config = createNextAuthConfig({ authService })
    const sessionCb = config.callbacks?.session
    expect(sessionCb).toBeDefined()

    const result = await sessionCb?.({
      session: {
        user: { email: 'alice@example.com' },
        expires: new Date().toISOString(),
      } as never,
      token: {
        sessionId: 'sess-1',
        userId: 'user-1',
        role: 'EMPLOYEE',
      },
    } as never)
    const asRecord = result as unknown as Record<string, unknown>
    expect(asRecord.sessionId).toBe('sess-1')
    expect(asRecord.userId).toBe('user-1')
    expect(asRecord.role).toBe('EMPLOYEE')
  })
})
