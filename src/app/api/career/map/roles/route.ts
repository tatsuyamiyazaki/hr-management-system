/**
 * Issue #40 / Req 5.1: 役職一覧 API
 *
 * GET /api/career/map/roles
 *   - 認証済みユーザーであれば全ロール参照可
 */
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { getCareerMapService } from '@/lib/career/career-map-service-di'

export {
  setCareerMapServiceForTesting,
  clearCareerMapServiceForTesting,
} from '@/lib/career/career-map-service-di'

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let svc: ReturnType<typeof getCareerMapService>
  try {
    svc = getCareerMapService()
  } catch {
    return NextResponse.json({ error: 'CareerMapService not initialized' }, { status: 503 })
  }

  try {
    const roles = await svc.listRoles()
    return NextResponse.json({ success: true, data: roles })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
