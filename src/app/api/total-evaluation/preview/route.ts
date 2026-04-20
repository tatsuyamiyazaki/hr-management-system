/**
 * Issue #66 / Task 19.1: Total evaluation preview API (Req 12.4)
 *
 * - GET /api/total-evaluation/preview?cycleId=X
 * - HR_MANAGER / ADMIN only
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { getTotalEvaluationService } from '@/lib/total-evaluation/total-evaluation-service-di'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sess = session as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  if (!role || !HR_OR_ADMIN_ROLES.includes(role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cycleId = request.nextUrl.searchParams.get('cycleId')
  if (!cycleId) {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 })
  }

  let service: ReturnType<typeof getTotalEvaluationService>
  try {
    service = getTotalEvaluationService()
  } catch {
    return NextResponse.json({ error: 'Total evaluation service not initialized' }, { status: 503 })
  }

  const preview = await service.previewBeforeFinalize(cycleId)
  return NextResponse.json({ success: true, data: preview }, { status: 200 })
}
