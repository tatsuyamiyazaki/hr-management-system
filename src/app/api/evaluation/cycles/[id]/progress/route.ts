/**
 * Issue #55 / Task 15.6: 評価サイクル進捗 API — HR向け全体 (Req 8.8)
 *
 * - GET /api/evaluation/cycles/[id]/progress — HR_MANAGER/ADMIN のみ
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getEvaluationProgressService } from '@/lib/evaluation/evaluation-progress-service-di'
import { EvaluationProgressCycleNotFoundError } from '@/lib/evaluation/evaluation-progress-types'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!HR_OR_ADMIN_ROLES.includes(guard.session.role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  let svc: ReturnType<typeof getEvaluationProgressService>
  try {
    svc = getEvaluationProgressService()
  } catch {
    return NextResponse.json(
      { error: 'EvaluationProgress service not initialized' },
      { status: 503 },
    )
  }

  try {
    const progress = await svc.getCycleProgress(id)
    return NextResponse.json({ success: true, data: progress })
  } catch (err) {
    if (err instanceof EvaluationProgressCycleNotFoundError) {
      return NextResponse.json({ error: 'ReviewCycle not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
