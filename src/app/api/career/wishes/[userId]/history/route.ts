/**
 * Issue #39 / Task 12.1: キャリア希望履歴 API (Req 5.6, 5.7)
 *
 * - GET /api/career/wishes/[userId]/history — 全履歴取得（HR_MANAGER以上のみ）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getCareerWishService } from '@/lib/career/career-wish-service-di'

const HR_MANAGER_OR_ABOVE: readonly string[] = ['HR_MANAGER', 'ADMIN']

function isHrManagerOrAbove(role: string): boolean {
  return HR_MANAGER_OR_ABOVE.includes(role)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!isHrManagerOrAbove(guard.session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = await params

  let svc: ReturnType<typeof getCareerWishService>
  try {
    svc = getCareerWishService()
  } catch {
    return NextResponse.json({ error: 'CareerWish service not initialized' }, { status: 503 })
  }

  try {
    const history = await svc.getWishHistory(userId)
    return NextResponse.json({ success: true, data: history })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
