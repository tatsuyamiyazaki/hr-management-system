/**
 * Issue #48 / Task 14.2: 1on1セッション ログ API (Req 7.3, 7.4)
 *
 * - POST /api/one-on-one/sessions/[sessionId]/log — ログ記録（MANAGER のみ）
 * - GET  /api/one-on-one/sessions/[sessionId]/log — セッションログ取得
 */
import { type NextRequest, NextResponse } from 'next/server'
import { oneOnOneLogInputSchema } from '@/lib/one-on-one/one-on-one-log-types'
import {
  parseJsonBody,
  requireAuthenticated,
  requireManager,
} from '@/lib/skill/skill-route-helpers'
import { getOneOnOneLogService } from '@/lib/one-on-one/one-on-one-log-service-di'
import { OneOnOneLogAccessDeniedError } from '@/lib/one-on-one/one-on-one-log-service'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  // MANAGER のみログ記録可能
  const guard = await requireManager()
  if (!guard.ok) return guard.response

  const { sessionId } = await context.params

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = oneOnOneLogInputSchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getOneOnOneLogService>
  try {
    svc = getOneOnOneLogService()
  } catch {
    return NextResponse.json({ error: 'OneOnOneLog service not initialized' }, { status: 503 })
  }

  try {
    const record = await svc.recordLog(sessionId, guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: record }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { sessionId } = await context.params

  let svc: ReturnType<typeof getOneOnOneLogService>
  try {
    svc = getOneOnOneLogService()
  } catch {
    return NextResponse.json({ error: 'OneOnOneLog service not initialized' }, { status: 503 })
  }

  try {
    const log = await svc.getSessionLog(sessionId, guard.session.userId, guard.session.role)
    return NextResponse.json({ success: true, data: log })
  } catch (err) {
    if (err instanceof OneOnOneLogAccessDeniedError) {
      return NextResponse.json({ error: 'Forbidden', reason: err.reason }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
