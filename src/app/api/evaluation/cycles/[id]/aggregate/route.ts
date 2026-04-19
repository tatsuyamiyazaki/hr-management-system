/**
 * Issue #51 / Task 15.2: 評価サイクル AGGREGATING 遷移 API (Req 8.1, 8.2)
 *
 * - POST /api/evaluation/cycles/[id]/aggregate — ACTIVE → AGGREGATING（HR_MANAGER/ADMIN）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getReviewCycleService } from '@/lib/evaluation/review-cycle-service-di'
import {
  ReviewCycleNotFoundError,
  ReviewCycleInvalidTransitionError,
} from '@/lib/evaluation/review-cycle-types'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!HR_OR_ADMIN_ROLES.includes(guard.session.role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  let svc: ReturnType<typeof getReviewCycleService>
  try {
    svc = getReviewCycleService()
  } catch {
    return NextResponse.json({ error: 'ReviewCycle service not initialized' }, { status: 503 })
  }

  try {
    const cycle = await svc.startAggregating(id)
    return NextResponse.json({ success: true, data: cycle })
  } catch (err) {
    if (err instanceof ReviewCycleNotFoundError) {
      return NextResponse.json({ error: 'ReviewCycle not found' }, { status: 404 })
    }
    if (err instanceof ReviewCycleInvalidTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
