/**
 * Issue #44 / Task 13.3: 部下の目標一覧取得 API (Req 6.7)
 *
 * - GET /api/goals/subordinates — 部下の目標・進捗・承認状態一覧（MANAGER以上のみ）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/skill/skill-route-helpers'
import { getGoalProgressService } from '@/lib/goal/goal-progress-service-di'

export {
  setGoalProgressServiceForTesting,
  clearGoalProgressServiceForTesting,
} from '@/lib/goal/goal-progress-service-di'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const guard = await requireManager()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getGoalProgressService>
  try {
    svc = getGoalProgressService()
  } catch {
    return NextResponse.json({ error: 'GoalProgress service not initialized' }, { status: 503 })
  }

  try {
    const goals = await svc.listSubordinateGoals(guard.session.userId)
    return NextResponse.json({ success: true, data: goals })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
