/**
 * Issue #40 / Req 5.3: スキルギャップ API
 *
 * GET /api/career/map/gap?desiredRoleId=<id>
 *   - ログインユーザー本人のギャップのみ返す
 */
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import { getCareerMapService } from '@/lib/career/career-map-service-di'

export {
  setCareerMapServiceForTesting,
  clearCareerMapServiceForTesting,
} from '@/lib/career/career-map-service-di'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const serverSession = await getServerSession()
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
