/**
 * Issue #43 / Task 13.2: 個人目標 完了 API (Req 6.5)
 *
 * POST /api/goals/personal/[id]/complete — IN_PROGRESS → COMPLETED（自分のみ）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getPersonalGoalService } from '@/lib/goal/personal-goal-service-di'
import {
  PersonalGoalNotFoundError,
  PersonalGoalInvalidTransitionError,
} from '@/lib/goal/personal-goal-types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { id } = await params

  let svc: ReturnType<typeof getPersonalGoalService>
  try {
    svc = getPersonalGoalService()
  } catch {
    return NextResponse.json({ error: 'PersonalGoal service not initialized' }, { status: 503 })
  }

  try {
    const goal = await svc.getGoal(id)
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    if (goal.userId !== guard.session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updated = await svc.completeGoal(id)
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
