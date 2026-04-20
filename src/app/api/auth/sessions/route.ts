/**
 * Task 6.4 / Req 1.14: 繧ｻ繝・す繝ｧ繝ｳ荳隕ｧ API
 *
 * GET /api/auth/sessions
 * - 隱崎ｨｼ貂医∩繝ｦ繝ｼ繧ｶ繝ｼ縺ｮ繧｢繧ｯ繝・ぅ繝悶そ繝・す繝ｧ繝ｳ荳隕ｧ繧定ｿ斐☆
 * - 迴ｾ蝨ｨ縺ｮ繧ｻ繝・す繝ｧ繝ｳ縺ｫ縺ｯ isCurrent: true 繧剃ｻ倅ｸ・
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { getAuthService } from '@/lib/auth/auth-service-di'
import type { Session } from '@/lib/auth/auth-types'

/**
 * 繧ｻ繝・す繝ｧ繝ｳ繝ｬ繧ｹ繝昴Φ繧ｹ蝙九・
 * isCurrent 繝輔ぅ繝ｼ繝ｫ繝峨〒迴ｾ蝨ｨ縺ｮ繧ｻ繝・す繝ｧ繝ｳ繧定ｭ伜挨縺ｧ縺阪ｋ繧医≧諡｡蠑ｵ縺吶ｋ縲・
 */
interface SessionResponse extends Session {
  readonly isCurrent: boolean
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // next-auth-config.ts 縺ｮ session 繧ｳ繝ｼ繝ｫ繝舌ャ繧ｯ縺後ヨ繝・・繝ｬ繝吶Ν縺ｫ險ｭ螳壹☆繧・
  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  const currentSessionId = typeof sess.sessionId === 'string' ? sess.sessionId : undefined

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Issue #107: AuthService 譛ｪ蛻晄悄蛹悶・ 503 Service Unavailable 縺ｨ縺励※謇ｱ縺・・
  // instrumentation.ts 縺ｮ險ｭ螳壻ｸ榊ｙ縺悟次蝗縺ｧ縺ゅｋ縺薙→繧剃ｼ昴∴繧・(500 繧医ｊ繧ょｮ牙・縺ｪ謇区寺縺九ｊ)縲・
  let authService: ReturnType<typeof getAuthService>
  try {
    authService = getAuthService()
  } catch {
    return NextResponse.json({ error: 'Auth service not initialized' }, { status: 503 })
  }

  try {
    const sessions = await authService.listSessions(userId)
    const response: SessionResponse[] = sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }))
    return NextResponse.json({ sessions: response })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
