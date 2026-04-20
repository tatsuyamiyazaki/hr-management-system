/**
 * Issue #40 / Req 5.3: 繧ｹ繧ｭ繝ｫ繧ｮ繝｣繝・・ API
 *
 * GET /api/career/map/gap?desiredRoleId=<id>
 *   - 繝ｭ繧ｰ繧､繝ｳ繝ｦ繝ｼ繧ｶ繝ｼ譛ｬ莠ｺ縺ｮ繧ｮ繝｣繝・・縺ｮ縺ｿ霑斐☆
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { getCareerMapService } from '@/lib/career/career-map-service-di'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const desiredRoleId = req.nextUrl.searchParams.get('desiredRoleId')
  if (!desiredRoleId) {
    return NextResponse.json({ error: 'desiredRoleId is required' }, { status: 400 })
  }

  let svc: ReturnType<typeof getCareerMapService>
  try {
    svc = getCareerMapService()
  } catch {
    return NextResponse.json({ error: 'CareerMapService not initialized' }, { status: 503 })
  }

  try {
    const result = await svc.calculateCareerGap(userId, desiredRoleId)
    return NextResponse.json({ success: true, data: result })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
