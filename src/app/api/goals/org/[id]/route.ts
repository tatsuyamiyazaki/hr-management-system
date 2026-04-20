/**
 * Issue #42 / Task 13.1: 邨・ｹ皮岼讓・蛟句挨蜿門ｾ・API (Req 6.1, 6.2)
 *
 * - GET /api/goals/org/[id] 窶・蛟句挨蜿門ｾ暦ｼ郁ｪ崎ｨｼ貂医∩繝ｦ繝ｼ繧ｶ繝ｼ蜈ｨ蜩｡・・
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { GoalNotFoundError } from '@/lib/goal/goal-types'
import { getOrgGoalService } from '@/lib/goal/org-goal-service-di'

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// Auth helper
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

async function requireAuthenticated(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  if (typeof sess.userId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// GET /api/goals/org/[id]
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { id } = await params

  let svc: ReturnType<typeof getOrgGoalService>
  try {
    svc = getOrgGoalService()
  } catch {
    return NextResponse.json({ error: 'OrgGoalService not initialized' }, { status: 503 })
  }

  try {
    const goal = await svc.getGoalById(id)
    return NextResponse.json({ success: true, data: goal })
  } catch (err) {
    if (err instanceof GoalNotFoundError) {
      return NextResponse.json(
        { error: 'Goal not found', kind: err.kind, id: err.resourceId },
        { status: 404 },
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
