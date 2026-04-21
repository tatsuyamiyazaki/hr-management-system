/**
 * Issue #174 / Req 14.6: 他ユーザーのプロフィール取得 API
 *
 * GET /api/profile/{userId}
 * - 全ロール参照可能（表示内容はロール別に制御）
 * - ADMIN / 自分自身: 全項目 (ProfileViewFull)
 * - その他: 基本情報のみ (ProfileViewBasic)
 * - 200: 成功
 * - 401: 未認証
 * - 404: 対象プロフィール不在
 * - 503: サービス未初期化
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { getProfileService } from '@/lib/lifecycle/profile-service-di'
import { ProfileNotFoundError } from '@/lib/lifecycle/profile-types'

function getAuthorizedUserId(
  serverSession: Awaited<ReturnType<typeof getAppSession>>,
): { ok: true; userId: string } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, userId }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const auth = getAuthorizedUserId(await getAppSession())
  if (!auth.ok) return auth.response

  const { userId: targetUserId } = await params
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  let svc: ReturnType<typeof getProfileService>
  try {
    svc = getProfileService()
  } catch {
    return NextResponse.json({ error: 'Profile service not initialized' }, { status: 503 })
  }

  try {
    const profile = await svc.getProfile(auth.userId, targetUserId)
    return NextResponse.json({ success: true, data: profile })
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
