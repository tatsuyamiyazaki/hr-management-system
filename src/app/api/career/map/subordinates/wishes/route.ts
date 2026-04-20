/**
 * Issue #40 / Req 5.4: 驛ｨ荳九く繝｣繝ｪ繧｢蟶梧悍荳隕ｧ API
 *
 * GET /api/career/map/subordinates/wishes
 *   - MANAGER / HR_MANAGER / ADMIN 縺ｮ縺ｿ繧｢繧ｯ繧ｻ繧ｹ蜿ｯ
 *   - 繝ｭ繧ｰ繧､繝ｳ繝ｦ繝ｼ繧ｶ繝ｼ驟堺ｸ九・驛ｨ荳九・繧ｭ繝｣繝ｪ繧｢蟶梧悍荳隕ｧ繧定ｿ斐☆
 */
import { getAppSession } from '@/lib/auth/app-session'
import { NextResponse } from 'next/server'
import { getCareerMapService } from '@/lib/career/career-map-service-di'

const ALLOWED_ROLES = new Set(['MANAGER', 'HR_MANAGER', 'ADMIN'])

export async function GET(): Promise<NextResponse> {
  const serverSession = await getAppSession()
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
