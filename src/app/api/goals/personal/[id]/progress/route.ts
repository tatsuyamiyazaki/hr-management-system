/**
 * Issue #44 / Task 13.3: 個人目標 進捗記録・履歴取得 API (Req 6.6)
 *
 * - POST /api/goals/personal/[id]/progress — 進捗記録（本人のみ）
 * - GET  /api/goals/personal/[id]/progress — 進捗履歴取得（本人 or MANAGER以上）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { progressUpdateSchema } from '@/lib/goal/goal-progress-types'
import {
  parseJsonBody,
  requireAuthenticated,
  isManagerOrAbove,
} from '@/lib/skill/skill-route-helpers'
import { getGoalProgressService } from '@/lib/goal/goal-progress-service-di'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { id: goalId } = await context.params

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = progressUpdateSchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getGoalProgressService>
  try {
    svc = getGoalProgressService()
  } catch {
    return NextResponse.json({ error: 'GoalProgress service not initialized' }, { status: 503 })
  }

  try {
    const record = await svc.recordProgress(goalId, validated.data, guard.session.userId)
    return NextResponse.json({ success: true, data: record }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { id: goalId } = await context.params

  // 本人 or MANAGER以上のみ閲覧可能
  const targetUserId = request.nextUrl.searchParams.get('userId') ?? guard.session.userId
  const isSelf = targetUserId === guard.session.userId
  if (!isSelf && !isManagerOrAbove(guard.session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getGoalProgressService>
  try {
    svc = getGoalProgressService()
  } catch {
    return NextResponse.json({ error: 'GoalProgress service not initialized' }, { status: 503 })
  }

  try {
    const history = await svc.getProgressHistory(goalId)
    return NextResponse.json({ success: true, data: history })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
