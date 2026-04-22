/**
 * Issue #175 / Task 11.2 / Req 4.4: スキルカタログ取得 API
 *
 * GET /api/skills/catalog
 * - 全ロール（認証済み）で参照可能
 * - 非推奨スキルを除外した SkillMaster 一覧を返す
 * - スキル登録フォームのドロップダウン用途
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getMasterService } from '@/lib/master/master-service-di'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getMasterService>
  try {
    svc = getMasterService()
  } catch {
    return NextResponse.json({ error: 'Master service not initialized' }, { status: 503 })
  }

  try {
    const skills = await svc.listSkills(false) // 非推奨を除外
    return NextResponse.json({ success: true, data: skills })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
