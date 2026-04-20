/**
 * Issue #47 / Task 14.1: 1on1 セッション詳細・更新 API (Req 7.1, 7.2)
 *
 * - GET   /api/one-on-one/sessions/[sessionId] — セッション詳細
 * - PATCH /api/one-on-one/sessions/[sessionId] — 予定更新（MANAGER のみ）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { oneOnOneSessionInputSchema } from '@/lib/one-on-one/one-on-one-types'
import {
  OneOnOneSessionNotFoundError,
  OneOnOneSessionAccessDeniedError,
} from '@/lib/one-on-one/one-on-one-types'
import {
  parseJsonBody,
  requireAuthenticated,
  requireManager,
} from '@/lib/skill/skill-route-helpers'
import { getOneOnOneSessionService } from '@/lib/one-on-one/one-on-one-session-service-di'
import type { OneOnOneSessionRecord } from '@/lib/one-on-one/one-on-one-types'

type RouteContext = { params: Promise<{ sessionId: string }> }

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { sessionId } = await context.params

  let svc: ReturnType<typeof getOneOnOneSessionService>
  try {
    svc = getOneOnOneSessionService()
  } catch {
    return NextResponse.json({ error: 'OneOnOneSession service not initialized' }, { status: 503 })
  }

  try {
    const session = await svc.getSession(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (!canReadSession(guard.session, session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ success: true, data: session })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function canReadSession(
  actor: { readonly userId: string; readonly role: string },
  session: OneOnOneSessionRecord,
): boolean {
  if (actor.role === 'ADMIN' || actor.role === 'HR_MANAGER') return true
  if (actor.role === 'MANAGER') return session.managerId === actor.userId
  return session.employeeId === actor.userId
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const guard = await requireManager()
  if (!guard.ok) return guard.response

  const { sessionId } = await context.params

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = oneOnOneSessionInputSchema.partial().safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getOneOnOneSessionService>
  try {
    svc = getOneOnOneSessionService()
  } catch {
    return NextResponse.json({ error: 'OneOnOneSession service not initialized' }, { status: 503 })
  }

  try {
    const session = await svc.updateSession(sessionId, guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: session })
  } catch (err) {
    if (err instanceof OneOnOneSessionNotFoundError) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (err instanceof OneOnOneSessionAccessDeniedError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
