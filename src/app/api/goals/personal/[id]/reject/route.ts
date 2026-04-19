/**
 * Issue #43 / Task 13.2: 個人目標 却下 API (Req 6.4)
 *
 * POST /api/goals/personal/[id]/reject — PENDING_APPROVAL → REJECTED（MANAGER以上）
 * Body: { reason: string }
 */
import { z } from 'zod'
import { type NextRequest, NextResponse } from 'next/server'
import { requireManager, parseJsonBody } from '@/lib/skill/skill-route-helpers'
import { getPersonalGoalService } from '@/lib/goal/personal-goal-service-di'
import {
  PersonalGoalNotFoundError,
  PersonalGoalInvalidTransitionError,
} from '@/lib/goal/personal-goal-types'

const rejectBodySchema = z.object({
  reason: z.string().min(1, 'reason is required'),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireManager()
  if (!guard.ok) return guard.response

  const { id } = await params

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = rejectBodySchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getPersonalGoalService>
  try {
    svc = getPersonalGoalService()
  } catch {
    return NextResponse.json({ error: 'PersonalGoal service not initialized' }, { status: 503 })
  }

  try {
    const updated = await svc.rejectGoal(id, guard.session.userId, validated.data.reason)
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
