/**
 * Issue #40 / Req 5.1: 蠖ｹ閨ｷ荳隕ｧ API
 *
 * GET /api/career/map/roles
 *   - 隱崎ｨｼ貂医∩繝ｦ繝ｼ繧ｶ繝ｼ縺ｧ縺ゅｌ縺ｰ蜈ｨ繝ｭ繝ｼ繝ｫ蜿ら・蜿ｯ
 */
import { getAppSession } from '@/lib/auth/app-session'
import { NextResponse } from 'next/server'
import { getCareerMapService } from '@/lib/career/career-map-service-di'

export async function GET(): Promise<NextResponse> {
  const session = await getAppSession()
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
