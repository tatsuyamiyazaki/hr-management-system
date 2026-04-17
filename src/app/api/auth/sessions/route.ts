/**
 * Task 6.4 / Req 1.14: セッション一覧 API
 *
 * GET /api/auth/sessions
 * - 認証済みユーザーのアクティブセッション一覧を返す
 * - 現在のセッションには isCurrent: true を付与
 */
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import type { Session } from '@/lib/auth/auth-types'
import type { AuthService } from '@/lib/auth/auth-service'

/**
 * セッションレスポンス型。
 * isCurrent フィールドで現在のセッションを識別できるよう拡張する。
 */
export interface SessionResponse extends Session {
  readonly isCurrent: boolean
}

/**
 * 依存注入用ファクトリ。テスト時に差し替え可能。
 * プロダクションでは実際の authService インスタンスを使う。
 */
let _authService: AuthService | null = null

export function setAuthServiceForTesting(svc: AuthService): void {
  _authService = svc
}

function getAuthService(): AuthService {
  if (_authService) return _authService
  // プロダクション用: 本来はDIコンテナやシングルトンから取得する
  throw new Error('AuthService is not configured. Use setAuthServiceForTesting or wire DI.')
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const serverSession = await getServerSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // NextAuth の JWT から userId と sessionId を取得する
  // next-auth-config.ts の JWT コールバックで設定されている想定
  const userId: string | undefined = (
    serverSession as Record<string, unknown> & { user?: { id?: string } }
  ).user?.id
  const currentSessionId: string | undefined = (
    serverSession as Record<string, unknown> & { sessionId?: string }
  ).sessionId as string | undefined

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const authService = getAuthService()
    const sessions = await authService.listSessions(userId)
    const response: SessionResponse[] = sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }))
    return NextResponse.json({ sessions: response })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
