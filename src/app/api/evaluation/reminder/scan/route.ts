/**
 * Issue #55 / Task 15.6: 評価リマインダースキャン API (Req 8.9)
 *
 * - POST /api/evaluation/reminder/scan — ADMIN のみ
 *   締切3日前のACTIVEサイクルの未提出者にリマインダー通知を送る
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getEvaluationProgressService } from '@/lib/evaluation/evaluation-progress-service-di'

export {
  setEvaluationProgressServiceForTesting,
  clearEvaluationProgressServiceForTesting,
} from '@/lib/evaluation/evaluation-progress-service-di'

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (guard.session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
    const result = await svc.scanAndSendReminders(new Date())
    return NextResponse.json({ success: true, data: result })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
