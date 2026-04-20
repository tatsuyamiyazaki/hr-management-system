/**
 * Issue #47 / Task 14.1: 1on1 セッション API (Req 7.1, 7.2)
 *
 * - POST /api/one-on-one/sessions — セッション作成（MANAGER 以上のみ）
 * - GET  /api/one-on-one/sessions — 自分のセッション一覧
 */
import { type NextRequest, NextResponse } from 'next/server'
import { oneOnOneSessionInputSchema } from '@/lib/one-on-one/one-on-one-types'
import {
  parseJsonBody,
  requireAuthenticated,
  requireManager,
} from '@/lib/skill/skill-route-helpers'
import { getOneOnOneSessionService } from '@/lib/one-on-one/one-on-one-session-service-di'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireManager()
  if (!guard.ok) return guard.response

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = oneOnOneSessionInputSchema.safeParse(parsedBody.body)
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
    const session = await svc.createSession(guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: session }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getOneOnOneSessionService>
  try {
    svc = getOneOnOneSessionService()
  } catch {
    return NextResponse.json({ error: 'OneOnOneSession service not initialized' }, { status: 503 })
  }

  try {
    const sessions = await svc.listMySessions(guard.session.userId, guard.session.role)
    return NextResponse.json({ success: true, data: sessions })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
