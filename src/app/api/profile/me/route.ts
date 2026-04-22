/**
 * Issue #174 / Req 14.5, 14.6: 自分のプロフィール取得・更新 API
 *
 * GET  /api/profile/me — 自分のプロフィールを全項目で取得
 * PATCH /api/profile/me — 自分のプロフィールを更新
 *   - body: ProfileInput (firstName / lastName / phoneNumber / selfIntro / avatarUrl 等)
 *   - 200: 成功
 *   - 422: バリデーションエラー
 *   - 401: 未認証
 *   - 503: サービス未初期化
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { getProfileService } from '@/lib/lifecycle/profile-service-di'
import { profileInputSchema, ProfileNotFoundError } from '@/lib/lifecycle/profile-types'

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

export async function GET(): Promise<NextResponse> {
  const auth = getAuthorizedUserId(await getAppSession())
  if (!auth.ok) return auth.response

  let svc: ReturnType<typeof getProfileService>
  try {
    svc = getProfileService()
  } catch {
    return NextResponse.json({ error: 'Profile service not initialized' }, { status: 503 })
  }

  try {
    const profile = await svc.getProfile(auth.userId, auth.userId)
    return NextResponse.json({ success: true, data: profile })
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = getAuthorizedUserId(await getAppSession())
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = profileInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getProfileService>
  try {
    svc = getProfileService()
  } catch {
    return NextResponse.json({ error: 'Profile service not initialized' }, { status: 503 })
  }

  try {
    await svc.editProfile(auth.userId, parsed.data)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
