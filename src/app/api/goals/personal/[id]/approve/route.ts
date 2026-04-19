/**
 * Issue #43 / Task 13.2: 個人目標 承認 API (Req 6.4)
 *
 * POST /api/goals/personal/[id]/approve — PENDING_APPROVAL → APPROVED（MANAGER以上）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/skill/skill-route-helpers'
import { getPersonalGoalService } from '@/lib/goal/personal-goal-service-di'
import {
  PersonalGoalNotFoundError,
  PersonalGoalInvalidTransitionError,
} from '@/lib/goal/personal-goal-types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireManager()
  if (!guard.ok) return guard.response

  const { id } = await params

  let svc: ReturnType<typeof getPersonalGoalService>
  try {
    svc = getPersonalGoalService()
  } catch {
    return NextResponse.json({ error: 'PersonalGoal service not initialized' }, { status: 503 })
  }

  try {
    const updated = await svc.approveGoal(id, guard.session.userId)
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    if (err instanceof PersonalGoalNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof PersonalGoalInvalidTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
