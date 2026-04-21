import { type NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getAppSession } from '@/lib/auth/app-session'
import { getTotalEvaluationService } from '@/lib/total-evaluation/total-evaluation-service-di'
import { totalEvaluationCorrectionSchema } from '@/lib/total-evaluation/total-evaluation-types'

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

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = getSessionRole(session)
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const correctedBy = getSessionUserId(session)
  if (!correctedBy) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let service: ReturnType<typeof getTotalEvaluationService>
  try {
    service = getTotalEvaluationService()
  } catch {
    return NextResponse.json({ error: 'Total evaluation service not initialized' }, { status: 503 })
  }

  try {
    const payload = totalEvaluationCorrectionSchema.parse(await request.json())
    const metadata = getRequestMetadata(request)
    const result = await service.correctAfterFinalize({
      ...payload,
      correctedBy,
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
