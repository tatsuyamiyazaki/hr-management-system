/**
 * Issue #175 / Task 11.4 / Req 4.7: 充足率不足ポスト一覧 API
 *
 * GET /api/skills/post-candidates/understaffed?threshold=0.6
 * - HR_MANAGER / ADMIN のみ
 * - threshold: 0〜1、デフォルト 0.6
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getPostCandidateService } from '@/lib/skill/post-candidate-service-di'

const HR_MANAGER_ROLES = ['HR_MANAGER', 'ADMIN'] as const

function isHrManagerOrAbove(role: string): boolean {
  return (HR_MANAGER_ROLES as readonly string[]).includes(role)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!isHrManagerOrAbove(guard.session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const thresholdParam = request.nextUrl.searchParams.get('threshold')
  const threshold = thresholdParam !== null ? parseFloat(thresholdParam) : undefined

  if (threshold !== undefined && (isNaN(threshold) || threshold < 0 || threshold > 1)) {
    return NextResponse.json(
      { error: 'threshold must be a number between 0 and 1' },
      { status: 400 },
    )
  }

  let svc: ReturnType<typeof getPostCandidateService>
  try {
    svc = getPostCandidateService()
  } catch {
    return NextResponse.json({ error: 'Post candidate service not initialized' }, { status: 503 })
  }

  try {
    const data = await svc.listUnderstaffedPosts(threshold)
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
