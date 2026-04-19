/**
 * Issue #46 / Task 13.5: 評価サイクル 作成 API (Req 6.9)
 *
 * - POST /api/goals/achievements/cycles — サイクル作成（HR_MANAGER/ADMIN）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { evaluationCycleInputSchema } from '@/lib/goal/goal-achievement-types'
import { getGoalAchievementService } from '@/lib/goal/goal-achievement-service-di'

export {
  setGoalAchievementServiceForTesting,
  clearGoalAchievementServiceForTesting,
} from '@/lib/goal/goal-achievement-service-di'

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

type UserRole = 'ADMIN' | 'HR_MANAGER' | 'MANAGER' | 'EMPLOYEE'

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'HR_MANAGER' || value === 'MANAGER' || value === 'EMPLOYEE'
}

async function requireAuthenticated(): Promise<
  { ok: true; userId: string; role: UserRole } | { ok: false; response: NextResponse }
> {
  const serverSession = await getServerSession()
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/goals/achievements/cycles
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!isHrManagerOrAbove(guard.role)) {
    return NextResponse.json({ error: 'Forbidden: HR_MANAGER or ADMIN required' }, { status: 403 })
  }

  let body: unknown
  try {
    body = (await request.json()) as unknown
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const validated = evaluationCycleInputSchema.safeParse(body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getGoalAchievementService>
  try {
    svc = getGoalAchievementService()
  } catch {
    return NextResponse.json({ error: 'GoalAchievementService not initialized' }, { status: 503 })
  }

  try {
    const created = await svc.createCycle(validated.data)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
