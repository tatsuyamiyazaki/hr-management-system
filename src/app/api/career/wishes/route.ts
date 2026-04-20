/**
 * Issue #39 / Task 12.1: キャリア希望 登録・取得 API (Req 5.2, 5.6, 5.7)
 *
 * - POST /api/career/wishes  — 希望登録（自分自身のみ）
 * - GET  /api/career/wishes?userId=...  — 現在の希望取得（本人 or HR_MANAGER以上）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { careerWishInputSchema } from '@/lib/career/career-wish-types'
import { parseJsonBody, requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getCareerWishService } from '@/lib/career/career-wish-service-di'

const HR_MANAGER_OR_ABOVE: readonly string[] = ['HR_MANAGER', 'ADMIN']

function isHrManagerOrAbove(role: string): boolean {
  return HR_MANAGER_OR_ABOVE.includes(role)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = careerWishInputSchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getCareerWishService>
  try {
    svc = getCareerWishService()
  } catch {
    return NextResponse.json({ error: 'CareerWish service not initialized' }, { status: 503 })
  }

  try {
    const wish = await svc.registerWish(guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: wish }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const targetUserId = request.nextUrl.searchParams.get('userId') ?? guard.session.userId
  const isSelf = targetUserId === guard.session.userId
  if (!isSelf && !isHrManagerOrAbove(guard.session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getCareerWishService>
  try {
    svc = getCareerWishService()
  } catch {
    return NextResponse.json({ error: 'CareerWish service not initialized' }, { status: 503 })
  }

  try {
    const wish = await svc.getCurrentWish(targetUserId)
    return NextResponse.json({ success: true, data: wish })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
