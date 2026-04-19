/**
 * Issue #48 / Task 14.2: 1on1タイムライン取得 API (Req 7.5)
 *
 * - GET /api/one-on-one/timeline?employeeId=...&managerId=... — タイムライン取得
 *   MANAGER: 全ログ表示
 *   EMPLOYEE: visibility=BOTH のログのみ表示
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getOneOnOneLogService } from '@/lib/one-on-one/one-on-one-log-service-di'
import { OneOnOneLogAccessDeniedError } from '@/lib/one-on-one/one-on-one-log-service'

export {
  setOneOnOneLogServiceForTesting,
  clearOneOnOneLogServiceForTesting,
} from '@/lib/one-on-one/one-on-one-log-service-di'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { searchParams } = request.nextUrl
  const employeeId = searchParams.get('employeeId')
  const managerId = searchParams.get('managerId')

  if (!employeeId || !managerId) {
    return NextResponse.json(
      { error: 'employeeId and managerId are required' },
      { status: 400 },
    )
  }

  let svc: ReturnType<typeof getOneOnOneLogService>
  try {
    svc = getOneOnOneLogService()
  } catch {
    return NextResponse.json({ error: 'OneOnOneLog service not initialized' }, { status: 503 })
  }

  try {
    const timeline = await svc.getTimeline(
      employeeId,
      managerId,
      guard.session.userId,
      guard.session.role,
    )
    return NextResponse.json({ success: true, data: timeline })
  } catch (err) {
    if (err instanceof OneOnOneLogAccessDeniedError) {
      return NextResponse.json({ error: 'Forbidden', reason: err.reason }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
