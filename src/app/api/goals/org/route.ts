/**
 * Issue #42 / Task 13.1: 組織目標 一覧・作成 API (Req 6.1, 6.2, 6.10)
 *
 * - GET  /api/goals/org            — 一覧取得（認証済みユーザー全員）
 *   * ?ownerType=ORGANIZATION|DEPARTMENT|TEAM でフィルタ可
 *   * ?ownerId=<id> でフィルタ可
 *   * ?tree=1&rootId=<id> でツリー構造を返す
 * - POST /api/goals/org            — 組織目標作成（HR_MANAGER / ADMIN のみ）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { GoalNotFoundError, orgGoalInputSchema, type GoalOwnerType } from '@/lib/goal/goal-types'
import { getOrgGoalService } from '@/lib/goal/org-goal-service-di'

export {
  setOrgGoalServiceForTesting,
  clearOrgGoalServiceForTesting,
} from '@/lib/goal/org-goal-service-di'

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

const VALID_OWNER_TYPES: readonly GoalOwnerType[] = ['ORGANIZATION', 'DEPARTMENT', 'TEAM']

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/goals/org
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getOrgGoalService>
  try {
    svc = getOrgGoalService()
  } catch {
    return NextResponse.json({ error: 'OrgGoalService not initialized' }, { status: 503 })
  }

  const params = request.nextUrl.searchParams
  const treeMode = params.get('tree') === '1'
  const rootId = params.get('rootId') ?? undefined
  const ownerTypeParam = params.get('ownerType')
  const ownerIdParam = params.get('ownerId') ?? undefined

  const ownerType =
    ownerTypeParam !== null && (VALID_OWNER_TYPES as readonly string[]).includes(ownerTypeParam)
      ? (ownerTypeParam as GoalOwnerType)
      : undefined

  try {
    if (treeMode) {
      const tree = await svc.getGoalTree(rootId)
      return NextResponse.json({ success: true, data: tree })
    }

    const goals = await svc.listGoals({ ownerType, ownerId: ownerIdParam })
    return NextResponse.json({ success: true, data: goals })
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/goals/org
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

  const validated = orgGoalInputSchema.safeParse(body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getOrgGoalService>
  try {
    svc = getOrgGoalService()
  } catch {
    return NextResponse.json({ error: 'OrgGoalService not initialized' }, { status: 503 })
  }

  try {
    const created = await svc.createGoal(validated.data)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
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
