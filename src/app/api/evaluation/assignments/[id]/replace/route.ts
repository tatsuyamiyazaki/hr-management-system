/**
 * Issue #52 / Task 15.3: 代替評価者設定 API (Req 8.12)
 *
 * - POST /api/evaluation/assignments/[id]/replace — 代替評価者設定（HR_MANAGER/ADMIN）
 */
import { z } from 'zod'
import { type NextRequest, NextResponse } from 'next/server'
import {
  AssignmentNotFoundError,
  AssignmentNotActiveError,
  MaxTargetsExceededError,
} from '@/lib/evaluation/review-assignment-types'
import { parseJsonBody, requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getReviewAssignmentService } from '@/lib/evaluation/review-assignment-service-di'

const replaceSchema = z.object({
  replacementEvaluatorId: z.string().min(1),
})

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!HR_OR_ADMIN_ROLES.includes(guard.session.role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: assignmentId } = await params

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = replaceSchema.safeParse(parsedBody.body)
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
    const newAssignment = await svc.assignReplacement(
      assignmentId,
      validated.data.replacementEvaluatorId,
    )
    return NextResponse.json({ success: true, data: newAssignment }, { status: 201 })
  } catch (err) {
    if (err instanceof AssignmentNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof AssignmentNotActiveError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof MaxTargetsExceededError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
