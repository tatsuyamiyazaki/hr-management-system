/**
 * Issue #43 / Task 13.2: 個人目標 API (Req 6.3, 6.4, 6.5)
 *
 * - POST /api/goals/personal — 目標作成（自分のみ）
 * - GET  /api/goals/personal — 自分の目標一覧
 */
import { type NextRequest, NextResponse } from 'next/server'
import { personalGoalInputSchema } from '@/lib/goal/personal-goal-types'
import { parseJsonBody, requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getPersonalGoalService } from '@/lib/goal/personal-goal-service-di'

export {
  setPersonalGoalServiceForTesting,
  clearPersonalGoalServiceForTesting,
} from '@/lib/goal/personal-goal-service-di'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = personalGoalInputSchema.safeParse(parsedBody.body)
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
    const goal = await svc.createGoal(guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: goal }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getPersonalGoalService>
  try {
    svc = getPersonalGoalService()
  } catch {
    return NextResponse.json({ error: 'PersonalGoal service not initialized' }, { status: 503 })
  }

  try {
    const goals = await svc.listMyGoals(guard.session.userId)
    return NextResponse.json({ success: true, data: goals })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
