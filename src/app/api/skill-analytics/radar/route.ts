/**
 * Issue #37 / Req 4.3: 遉ｾ蜩｡繧ｹ繧ｭ繝ｫ繝ｬ繝ｼ繝繝ｼ API
 *
 * GET /api/skill-analytics/radar?userId=<string>
 *   - 譛ｬ莠ｺ or HR_MANAGER / ADMIN 縺ｮ縺ｿ
 *   - 謖・ｮ夂､ｾ蜩｡縺ｮ RadarData 繧定ｿ斐☆
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { getSkillAnalyticsService } from '@/lib/skill/skill-analytics-di'

interface SessionInfo {
  readonly userId: string
  readonly role: string
}

async function resolveSession(): Promise<SessionInfo | null> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) return null
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!role || !userId) return null
  return { role, userId }
}

function canAccess(session: SessionInfo, targetUserId: string): boolean {
  if (session.role === 'HR_MANAGER' || session.role === 'ADMIN') return true
  return session.userId === targetUserId
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await resolveSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const targetUserId = request.nextUrl.searchParams.get('userId')?.trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  if (!canAccess(session, targetUserId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getSkillAnalyticsService>
  try {
    svc = getSkillAnalyticsService()
  } catch {
    return NextResponse.json({ error: 'SkillAnalyticsService not initialized' }, { status: 503 })
  }

  try {
    const radar = await svc.getEmployeeRadar(targetUserId)
    return NextResponse.json({ success: true, data: radar })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
