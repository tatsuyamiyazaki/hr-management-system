/**
 * Issue #46 / Task 13.5: 繝ｦ繝ｼ繧ｶ繝ｼ蛟句挨驕疲・邇・し繝槭Μ API (Req 6.9)
 *
 * - GET /api/goals/achievements/cycles/[cycleId]/users/[userId]
 *   窶・繝ｦ繝ｼ繧ｶ繝ｼ蛟句挨繧ｵ繝槭Μ・域悽莠ｺ or HR_MANAGER/ADMIN・・
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
// GET /api/goals/achievements/cycles/[cycleId]/users/[userId]
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cycleId: string; userId: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { cycleId, userId } = await params

  // 譛ｬ莠ｺ縺・HR_MANAGER/ADMIN 縺ｮ縺ｿ繧｢繧ｯ繧ｻ繧ｹ蜿ｯ
  if (guard.userId !== userId && !isHrManagerOrAbove(guard.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getGoalAchievementService>
  try {
    svc = getGoalAchievementService()
  } catch {
    return NextResponse.json({ error: 'GoalAchievementService not initialized' }, { status: 503 })
  }

  try {
    const summary = await svc.getAchievementSummary(cycleId, userId)
    return NextResponse.json({ success: true, data: summary })
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
