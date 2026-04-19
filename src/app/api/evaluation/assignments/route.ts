/**
 * Issue #52 / Task 15.3: 評価割り当て API (Req 8.3, 8.4)
 *
 * - POST /api/evaluation/assignments — 割り当て追加（HR_MANAGER/ADMIN）
 * - GET  /api/evaluation/assignments?cycleId=...&evaluatorId=... — 評価者の一覧
 * - GET  /api/evaluation/assignments?cycleId=...&targetUserId=... — 対象者への一覧（HR_MANAGER/ADMIN）
 * - GET  /api/evaluation/assignments?cycleId=... — サイクル全体の一覧（HR_MANAGER/ADMIN）
 */
import { type NextRequest, NextResponse } from 'next/server'
import {
  addAssignmentSchema,
  DuplicateAssignmentError,
  MaxTargetsExceededError,
} from '@/lib/evaluation/review-assignment-types'
import { parseJsonBody, requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getReviewAssignmentService } from '@/lib/evaluation/review-assignment-service-di'

export {
  setReviewAssignmentServiceForTesting,
  clearReviewAssignmentServiceForTesting,
} from '@/lib/evaluation/review-assignment-service-di'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!HR_OR_ADMIN_ROLES.includes(guard.session.role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = addAssignmentSchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getReviewAssignmentService>
  try {
    svc = getReviewAssignmentService()
  } catch {
    return NextResponse.json({ error: 'ReviewAssignment service not initialized' }, { status: 503 })
  }

  try {
    const assignment = await svc.addAssignment(validated.data)
    return NextResponse.json({ success: true, data: assignment }, { status: 201 })
  } catch (err) {
    if (err instanceof MaxTargetsExceededError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    if (err instanceof DuplicateAssignmentError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(request.url)
  const cycleId = searchParams.get('cycleId')
  const evaluatorId = searchParams.get('evaluatorId')
  const targetUserId = searchParams.get('targetUserId')

  if (!cycleId) {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 })
  }

  let svc: ReturnType<typeof getReviewAssignmentService>
  try {
    svc = getReviewAssignmentService()
  } catch {
    return NextResponse.json({ error: 'ReviewAssignment service not initialized' }, { status: 503 })
  }

  const isHrOrAdmin = HR_OR_ADMIN_ROLES.includes(
    guard.session.role as (typeof HR_OR_ADMIN_ROLES)[number],
  )

  try {
    if (evaluatorId) {
      // 評価者の一覧 — 自分自身または HR_MANAGER/ADMIN のみ
      if (!isHrOrAdmin && guard.session.userId !== evaluatorId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const assignments = await svc.listByEvaluator(cycleId, evaluatorId)
      return NextResponse.json({ success: true, data: assignments })
    }

    if (targetUserId) {
      // 対象者への一覧 — HR_MANAGER/ADMIN のみ
      if (!isHrOrAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const assignments = await svc.listByTarget(cycleId, targetUserId)
      return NextResponse.json({ success: true, data: assignments })
    }

    // サイクル全体 — HR_MANAGER/ADMIN のみ
    if (!isHrOrAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const assignments = await svc.listByCycle(cycleId)
    return NextResponse.json({ success: true, data: assignments })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
