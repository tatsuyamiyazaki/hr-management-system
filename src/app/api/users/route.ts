/**
 * Task 6.5 / Req 1.10: 繝ｦ繝ｼ繧ｶ繝ｼ諡帛ｾ・API
 *
 * POST /api/users
 * - ADMIN 縺ｮ縺ｿ螳溯｡悟庄閭ｽ
 * - email / role 繧貞女縺大叙繧頑魚蠕・Γ繝ｼ繝ｫ繧帝∽ｿ｡縺吶ｋ
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { inviteUserInputSchema, EmailAlreadyExistsError } from '@/lib/auth/invitation-types'
import { getInvitationService } from '@/lib/auth/invitation-service-di'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined

  if (role !== 'ADMIN' || !userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = inviteUserInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getInvitationService>
  try {
    svc = getInvitationService()
  } catch {
    return NextResponse.json({ error: 'Invitation service not initialized' }, { status: 503 })
  }

  try {
    await svc.inviteUser(parsed.data, userId)
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    if (err instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
