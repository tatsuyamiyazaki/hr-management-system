/**
 * Task 6.5 / Req 1.10: 招待承認・初回パスワード設定 API
 *
 * POST /api/auth/invitations/[token]
 * - 認証不要 (公開エンドポイント)
 * - 招待トークンとパスワードを受け取り、アカウントを有効化する
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  InvitationNotFoundError,
  InvitationExpiredError,
  InvitationAlreadyUsedError,
} from '@/lib/auth/invitation-types'
import { PasswordPolicyViolationError } from '@/lib/auth/auth-types'
import { getInvitationService } from '@/lib/auth/invitation-service-di'

const acceptBodySchema = z.object({
  password: z.string().min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = acceptBodySchema.safeParse(body)
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
    await svc.acceptInvitation(token, parsed.data.password)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof InvitationNotFoundError) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }
    if (err instanceof InvitationExpiredError) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 })
    }
    if (err instanceof InvitationAlreadyUsedError) {
      return NextResponse.json({ error: 'Invitation already used' }, { status: 409 })
    }
    if (err instanceof PasswordPolicyViolationError) {
      return NextResponse.json(
        { error: 'Password policy violation', rule: err.rule },
        { status: 422 },
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
