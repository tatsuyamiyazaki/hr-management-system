/**
 * Task 6.4 / Req 1.15: 繧ｻ繝・す繝ｧ繝ｳ謇句虚螟ｱ蜉ｹ API
 *
 * DELETE /api/auth/sessions/:sessionId
 * - 隱崎ｨｼ貂医∩繝ｦ繝ｼ繧ｶ繝ｼ縺梧欠螳壹そ繝・す繝ｧ繝ｳ繧貞､ｱ蜉ｹ縺輔○繧・
 * - 閾ｪ蛻・・繧ｻ繝・す繝ｧ繝ｳ縺ｮ縺ｿ螟ｱ蜉ｹ蜿ｯ閭ｽ (莉悶Θ繝ｼ繧ｶ繝ｼ縺ｮ繧ｻ繝・す繝ｧ繝ｳ縺ｯ 404)
 * - 謌仙粥: 204 No Content
 * - 譛ｪ謇譛・/ 蟄伜惠縺励↑縺・ 404
 */
import { z } from 'zod'
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { SessionNotFoundError } from '@/lib/auth/auth-types'
import { getAuthService } from '@/lib/auth/auth-service-di'

/** UUID 蠖｢蠑上ｒ蠑ｷ蛻ｶ縺励※繝代せ繝ｻ繝医Λ繝舌・繧ｵ繝ｫ遲峨・荳肴ｭ｣蛟､繧呈掠譛滓賜髯､縺吶ｋ */
const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
})

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // next-auth-config.ts 縺ｮ session 繧ｳ繝ｼ繝ｫ繝舌ャ繧ｯ縺後ヨ繝・・繝ｬ繝吶Ν縺ｫ險ｭ螳壹☆繧・
  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawParams = await params
  const parsed = sessionIdParamSchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 })
  }

  const { sessionId } = parsed.data

  // Issue #107: AuthService 譛ｪ蛻晄悄蛹悶・ 503 Service Unavailable 縺ｨ縺励※謇ｱ縺・・
  // instrumentation.ts 縺ｮ險ｭ螳壻ｸ榊ｙ縺悟次蝗縺ｧ縺ゅｋ縺薙→繧剃ｼ昴∴繧・(500 繧医ｊ繧ょｮ牙・縺ｪ謇区寺縺九ｊ)縲・
  let authService: ReturnType<typeof getAuthService>
  try {
    authService = getAuthService()
  } catch {
    return NextResponse.json({ error: 'Auth service not initialized' }, { status: 503 })
  }

  try {
    await authService.revokeSession(userId, sessionId)
    return new NextResponse(null, { status: 204 })
  } catch (error: unknown) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
