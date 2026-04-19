/**
 * Issue #38 / Req 4.7, 4.8: ポスト充足アラート / スキルギャップランキング API
 *
 * - GET /api/skills/post-candidates/understaffed?threshold=0.6 — 充足率不足ポスト一覧 (Req 4.7)
 * - GET /api/skills/post-candidates/gap-ranking               — スキルギャップランキング (Req 4.8)
 *
 * 両エンドポイントとも HR_MANAGER / ADMIN のみ許可。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getPostCandidateService } from '@/lib/skill/post-candidate-service-di'

export {
  setPostCandidateServiceForTesting,
  clearPostCandidateServiceForTesting,
} from '@/lib/skill/post-candidate-service-di'

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

  const path = request.nextUrl.pathname

  let svc: ReturnType<typeof getPostCandidateService>
  try {
    svc = getPostCandidateService()
  } catch {
    return NextResponse.json({ error: 'Post candidate service not initialized' }, { status: 503 })
  }

  if (path.endsWith('/understaffed')) {
    return handleUnderstaffed(request, svc)
  }

  if (path.endsWith('/gap-ranking')) {
    return handleGapRanking(svc)
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

async function handleUnderstaffed(
  request: NextRequest,
  svc: ReturnType<typeof getPostCandidateService>,
): Promise<NextResponse> {
  const thresholdParam = request.nextUrl.searchParams.get('threshold')
  const threshold = thresholdParam !== null ? parseFloat(thresholdParam) : undefined

  if (threshold !== undefined && (isNaN(threshold) || threshold < 0 || threshold > 1)) {
    return NextResponse.json(
      { error: 'threshold must be a number between 0 and 1' },
      { status: 400 },
    )
  }

  try {
    const data = await svc.listUnderstaffedPosts(threshold)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[post-candidates] listUnderstaffedPosts error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleGapRanking(
  svc: ReturnType<typeof getPostCandidateService>,
): Promise<NextResponse> {
  try {
    const data = await svc.getSkillGapRanking()
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[post-candidates] getSkillGapRanking error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
