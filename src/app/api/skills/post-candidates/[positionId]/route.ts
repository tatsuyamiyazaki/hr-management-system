/**
 * Issue #38 / Req 4.6: ポスト候補者一覧 API
 *
 * GET /api/skills/post-candidates/[positionId]/candidates
 * - 役職要件に対する候補者一覧とスキル充足率を返す (Req 4.6)
 * - HR_MANAGER / ADMIN のみ許可
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getPostCandidateService } from '@/lib/skill/post-candidate-service-di'

const HR_MANAGER_ROLES = ['HR_MANAGER', 'ADMIN'] as const

function isHrManagerOrAbove(role: string): boolean {
  return (HR_MANAGER_ROLES as readonly string[]).includes(role)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!isHrManagerOrAbove(guard.session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { positionId } = await params

  let svc: ReturnType<typeof getPostCandidateService>
  try {
    svc = getPostCandidateService()
  } catch {
    return NextResponse.json({ error: 'Post candidate service not initialized' }, { status: 503 })
  }

  try {
    const data = await svc.listCandidatesForPost(positionId)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    if (err instanceof Error && err.message === 'Position not found') {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }
    console.error('[post-candidates] listCandidatesForPost error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
