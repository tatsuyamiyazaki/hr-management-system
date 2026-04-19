/**
 * Issue #40 / Req 5.4: 部下キャリア希望一覧 API
 *
 * GET /api/career/map/subordinates/wishes
 *   - MANAGER / HR_MANAGER / ADMIN のみアクセス可
 *   - ログインユーザー配下の部下のキャリア希望一覧を返す
 */
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { getCareerMapService } from '@/lib/career/career-map-service-di'

export {
  setCareerMapServiceForTesting,
  clearCareerMapServiceForTesting,
} from '@/lib/career/career-map-service-di'

const ALLOWED_ROLES = new Set(['MANAGER', 'HR_MANAGER', 'ADMIN'])

export async function GET(): Promise<NextResponse> {
  const serverSession = await getServerSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  const role = typeof sess.role === 'string' ? sess.role : undefined

  if (!userId || !role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getCareerMapService>
  try {
    svc = getCareerMapService()
  } catch {
    return NextResponse.json({ error: 'CareerMapService not initialized' }, { status: 503 })
  }

  try {
    const wishes = await svc.listSubordinateWishes(userId)
    return NextResponse.json({ success: true, data: wishes })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
