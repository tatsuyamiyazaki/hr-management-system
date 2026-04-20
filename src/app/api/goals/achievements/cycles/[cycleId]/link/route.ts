/**
 * Issue #46 / Task 13.5: 逶ｮ讓咎＃謌千紫騾｣謳ｺ API (Req 6.9)
 *
 * - POST /api/goals/achievements/cycles/[cycleId]/link 窶・逶ｮ讓咎＃謌千紫繧帝｣謳ｺ・・R_MANAGER/ADMIN・・
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { EvaluationCycleNotFoundError } from '@/lib/goal/goal-achievement-types'
import { getGoalAchievementService } from '@/lib/goal/goal-achievement-service-di'

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// Auth helpers
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

type UserRole = 'ADMIN' | 'HR_MANAGER' | 'MANAGER' | 'EMPLOYEE'

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'HR_MANAGER' || value === 'MANAGER' || value === 'EMPLOYEE'
}

async function requireAuthenticated(): Promise<
  { ok: true; userId: string; role: UserRole } | { ok: false; response: NextResponse }
> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  const roleValue = sess.role
  if (!userId || !isUserRole(roleValue)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, userId, role: roleValue }
}

function isHrManagerOrAbove(role: UserRole): boolean {
  return role === 'HR_MANAGER' || role === 'ADMIN'
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// POST /api/goals/achievements/cycles/[cycleId]/link
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ cycleId: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!isHrManagerOrAbove(guard.role)) {
    return NextResponse.json({ error: 'Forbidden: HR_MANAGER or ADMIN required' }, { status: 403 })
  }

  const { cycleId } = await params

  let svc: ReturnType<typeof getGoalAchievementService>
  try {
    svc = getGoalAchievementService()
  } catch {
    return NextResponse.json({ error: 'GoalAchievementService not initialized' }, { status: 503 })
  }

  try {
    const result = await svc.linkGoalsToCycle(cycleId)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    if (err instanceof EvaluationCycleNotFoundError) {
      return NextResponse.json(
        { error: 'EvaluationCycle not found', cycleId: err.cycleId },
        { status: 404 },
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
