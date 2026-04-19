/**
 * Issue #51 / Task 15.2: 360度評価サイクル API (Req 8.1, 8.2)
 *
 * - POST /api/evaluation/cycles — サイクル作成（HR_MANAGER/ADMIN）
 * - GET  /api/evaluation/cycles — 一覧取得（認証済み全員）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { reviewCycleInputSchema } from '@/lib/evaluation/review-cycle-types'
import { parseJsonBody, requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getReviewCycleService } from '@/lib/evaluation/review-cycle-service-di'

export {
  setReviewCycleServiceForTesting,
  clearReviewCycleServiceForTesting,
} from '@/lib/evaluation/review-cycle-service-di'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!HR_OR_ADMIN_ROLES.includes(guard.session.role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = reviewCycleInputSchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getReviewCycleService>
  try {
    svc = getReviewCycleService()
  } catch {
    return NextResponse.json({ error: 'ReviewCycle service not initialized' }, { status: 503 })
  }

  try {
    const cycle = await svc.createCycle(guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: cycle }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get('status') ?? undefined

  let svc: ReturnType<typeof getReviewCycleService>
  try {
    svc = getReviewCycleService()
  } catch {
    return NextResponse.json({ error: 'ReviewCycle service not initialized' }, { status: 503 })
  }

  try {
    const cycles = await svc.listCycles(statusParam ? { status: statusParam as never } : undefined)
    return NextResponse.json({ success: true, data: cycles })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
