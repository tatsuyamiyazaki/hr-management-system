/**
 * Issue #53 / Task 15.4: 評価回答 下書き保存 API (Req 8.5, 8.6)
 *
 * - POST /api/evaluation/responses/draft — 下書き保存（認証済み）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { evaluationResponseInputSchema } from '@/lib/evaluation/evaluation-response-types'
import { parseJsonBody, requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getEvaluationResponseService } from '@/lib/evaluation/evaluation-response-service-di'

export {
  setEvaluationResponseServiceForTesting,
  clearEvaluationResponseServiceForTesting,
} from '@/lib/evaluation/evaluation-response-service-di'

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
    const response = await svc.saveDraft(guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: response }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
