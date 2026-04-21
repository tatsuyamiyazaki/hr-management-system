import { type NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getAppSession } from '@/lib/auth/app-session'
import { getTotalEvaluationService } from '@/lib/total-evaluation/total-evaluation-service-di'
import { totalEvaluationFinalizeSchema } from '@/lib/total-evaluation/total-evaluation-types'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

function isAllowedRole(role: string | undefined): boolean {
  return !!role && HR_OR_ADMIN_ROLES.includes(role as (typeof HR_OR_ADMIN_ROLES)[number])
}

function getSessionRole(session: unknown): string | undefined {
  const sess = session as Record<string, unknown>
  return typeof sess.role === 'string' ? sess.role : undefined
}

function getSessionUserId(session: unknown): string | undefined {
  const sess = session as Record<string, unknown>
  return typeof sess.userId === 'string' ? sess.userId : undefined
}

function getRequestMetadata(request: NextRequest): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: request.headers.get('x-forwarded-for') ?? '127.0.0.1',
    userAgent: request.headers.get('user-agent') ?? 'unknown',
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = getSessionRole(session)
  if (!isAllowedRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const finalizedBy = getSessionUserId(session)
  if (!finalizedBy) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let service: ReturnType<typeof getTotalEvaluationService>
  try {
    service = getTotalEvaluationService()
  } catch {
    return NextResponse.json({ error: 'Total evaluation service not initialized' }, { status: 503 })
  }

  try {
    const payload = totalEvaluationFinalizeSchema.parse(await request.json())
    const metadata = getRequestMetadata(request)
    const result = await service.finalize({
      ...payload,
      finalizedBy,
      ...metadata,
    })
    return NextResponse.json({ success: true, data: result }, { status: 200 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten() },
        { status: 422 },
      )
    }
    throw error
  }
}
