/**
 * Issue #53 / Task 15.4: 評価回答 送信 API (Req 8.5, 8.6, 8.7)
 *
 * - POST /api/evaluation/responses/submit — 送信（認証済み）
 */
import { type NextRequest, NextResponse } from 'next/server'
import {
  evaluationResponseInputSchema,
  EvaluationAlreadySubmittedError,
  EvaluationNotAssignedError,
} from '@/lib/evaluation/evaluation-response-types'
import { parseJsonBody, requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getEvaluationResponseService } from '@/lib/evaluation/evaluation-response-service-di'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = evaluationResponseInputSchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getEvaluationResponseService>
  try {
    svc = getEvaluationResponseService()
  } catch {
    return NextResponse.json(
      { error: 'EvaluationResponse service not initialized' },
      { status: 503 },
    )
  }

  try {
    const response = await svc.submit(guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: response }, { status: 200 })
  } catch (err) {
    if (err instanceof EvaluationAlreadySubmittedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof EvaluationNotAssignedError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
