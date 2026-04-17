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
import { getAuthService } from '@/lib/auth/auth-service-di'

export { setAuthServiceForTesting, clearAuthServiceForTesting } from '@/lib/auth/auth-service-di'

/**
 * セッションレスポンス型。
 * isCurrent フィールドで現在のセッションを識別できるよう拡張する。
 */
export interface SessionResponse extends Session {
  readonly isCurrent: boolean
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const serverSession = await getServerSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // next-auth-config.ts の session コールバックがトップレベルに設定する
  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  const currentSessionId = typeof sess.sessionId === 'string' ? sess.sessionId : undefined

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sessions = await getAuthService().listSessions(userId)
    const response: SessionResponse[] = sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }))
    return NextResponse.json({ sessions: response })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
