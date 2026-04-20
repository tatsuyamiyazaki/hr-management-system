/**
 * Issue #58 / Task 16.2: AI コーチング品質ゲート API
 * (Requirements: 9.1, 9.3, 9.5, 9.6)
 *
 * POST /api/evaluation/ai-coach/validate
 * - 評価コメントを AI に送信し品質判定を実行
 * - 5秒タイムアウト時は手動モード切替レスポンスを返却
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getAICoachService } from '@/lib/ai-coach/ai-coach-service-di'
import { chatTurnSchema } from '@/lib/ai-coach/ai-coach-types'

// ─────────────────────────────────────────────────────────────────────────────
// Request body schema
// ─────────────────────────────────────────────────────────────────────────────

const requestBodySchema = z.object({
  cycleId: z.string().min(1),
  subjectRoleContext: z.string().min(1),
  draftComment: z.string().min(1),
  conversationHistory: z.array(chatTurnSchema),
})

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 認証チェック
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  // リクエストボディパース
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validated = requestBodySchema.safeParse(body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  // AICoachService 取得
  let service: ReturnType<typeof getAICoachService>
  try {
    service = getAICoachService()
  } catch {
    return NextResponse.json(
      { error: 'AICoachService not initialized' },
      { status: 503 },
    )
  }

  // 品質判定実行
  try {
    const result = await service.validateComment({
      cycleId: validated.data.cycleId,
      evaluatorId: guard.session.userId,
      subjectRoleContext: validated.data.subjectRoleContext,
      draftComment: validated.data.draftComment,
      conversationHistory: validated.data.conversationHistory,
    })

    // タイムアウト判定
    if ('timeout' in result && result.timeout) {
      return NextResponse.json({
        success: false,
        timeout: result,
      })
    }

    // 正常レスポンス
    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch {
    return NextResponse.json(
      { error: 'AI quality gate validation failed' },
      { status: 500 },
    )
  }
}
