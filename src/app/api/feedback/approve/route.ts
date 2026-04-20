/**
 * Issue #55 / Task 17.3: HR_MANAGER フィードバック承認・公開 API (Req 10.4, 10.6)
 *
 * - POST /api/feedback/approve — PENDING_HR_APPROVAL → PUBLISHED 遷移
 * - HR_MANAGER / ADMIN のみアクセス可能
 * - 承認後は被評価者のマイページで閲覧可能になる
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppSession } from '@/lib/auth/app-session'
import { getFeedbackService } from '@/lib/feedback/feedback-service-di'
import {
  FeedbackNotFoundError,
  FeedbackInvalidStatusError,
} from '@/lib/feedback/feedback-service'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

const bodySchema = z.object({
  cycleId: z.string().min(1),
  subjectId: z.string().min(1),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 認証チェック
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sess = session as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!userId || !role || !HR_OR_ADMIN_ROLES.includes(role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // リクエストボディの解析
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const validated = bodySchema.safeParse(body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getFeedbackService>
  try {
    svc = getFeedbackService()
  } catch {
    return NextResponse.json({ error: 'Feedback service not initialized' }, { status: 503 })
  }

  try {
    await svc.approveAndPublish(validated.data.cycleId, validated.data.subjectId, userId)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof FeedbackNotFoundError) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 })
    }
    if (err instanceof FeedbackInvalidStatusError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
