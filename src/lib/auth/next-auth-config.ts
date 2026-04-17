/**
 * Task 6.1 / Req 1.2: NextAuth v5 設定ファクトリ
 *
 * - CredentialsProvider で email + password 認証
 * - authorize コールバックは AuthService.login に委譲し、
 *   失敗時は null を返す (NextAuth の契約)
 * - session: jwt + maxAge 8h (Req 1.4 の絶対期限と一致)
 *
 * 注意: 実際の NextAuth ルート (`src/app/api/auth/[...nextauth]/route.ts`)
 * への配置は別タスクで実施する。本モジュールは設定オブジェクトを生成する関数のみを提供する。
 */
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { InvalidCredentialsError, loginInputSchema } from './auth-types'
import type { AuthService, LoginContext } from './auth-service'

/** Req 1.4 対応: NextAuth JWT の maxAge (秒) */
export const NEXT_AUTH_SESSION_MAX_AGE_SEC = 8 * 60 * 60

export interface CreateNextAuthConfigDeps {
  readonly authService: AuthService
}

/**
 * NextAuth v5 の設定を組み立てる。
 *
 * authorize コールバックは:
 *   - 入力を Zod (loginInputSchema) で検証
 *   - authService.login を呼び、成功時は { id, email, role, sessionId } を返す
 *   - 失敗 (InvalidCredentialsError や ZodError) 時は null を返す
 */
export function createNextAuthConfig(deps: CreateNextAuthConfigDeps): NextAuthConfig {
  const { authService } = deps

  return {
    session: {
      strategy: 'jwt',
      maxAge: NEXT_AUTH_SESSION_MAX_AGE_SEC,
    },
    pages: {
      signIn: '/login',
    },
    providers: [
      Credentials({
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials, request) {
          const parsed = loginInputSchema.safeParse(credentials)
          if (!parsed.success) {
            return null
          }
          const context = extractLoginContext(request)
          try {
            const session = await authService.login(parsed.data, context)
            return {
              id: session.userId,
              email: session.email,
              role: session.role,
              sessionId: session.id,
            }
          } catch (error: unknown) {
            if (error instanceof InvalidCredentialsError) {
              return null
            }
            // 予期せぬ例外も拒否扱い。NextAuth に伝播させると 500 になり UX が悪化するため。
            return null
          }
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          const extended = user as Record<string, unknown>
          if (typeof extended.sessionId === 'string') {
            token.sessionId = extended.sessionId
          }
          if (typeof extended.id === 'string') {
            token.userId = extended.id
          }
          if (typeof extended.role === 'string') {
            token.role = extended.role
          }
          if (typeof extended.email === 'string') {
            token.email = extended.email
          }
        }
        return token
      },
      async session({ session, token }) {
        const target = session as unknown as Record<string, unknown>
        if (typeof token.sessionId === 'string') {
          target.sessionId = token.sessionId
        }
        if (typeof token.userId === 'string') {
          target.userId = token.userId
        }
        if (typeof token.role === 'string') {
          target.role = token.role
        }
        return session
      },
    },
  }
}

/**
 * NextAuth の authorize コールバックに渡ってくる Request から
 * IP / UserAgent を抽出する。取得できない場合は undefined を返す。
 */
function extractLoginContext(request: Request | undefined): LoginContext | undefined {
  if (!request) return undefined
  const ipAddress = firstForwardedFor(request.headers.get('x-forwarded-for'))
  const userAgent = request.headers.get('user-agent') ?? undefined
  if (!ipAddress && !userAgent) return undefined
  return { ipAddress, userAgent }
}

function firstForwardedFor(header: string | null): string | undefined {
  if (!header) return undefined
  const first = header.split(',')[0]?.trim()
  return first && first.length > 0 ? first : undefined
}
