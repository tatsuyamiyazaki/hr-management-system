import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getAppSession } from '@/lib/auth/app-session'
import { getAppealService } from '@/lib/appeal/appeal-service-di'
import {
  AppealDeadlineExceededError,
  AppealTargetNotFoundError,
  appealInputSchema,
} from '@/lib/appeal/appeal-types'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sess = session as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (role !== 'EMPLOYEE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let service: ReturnType<typeof getAppealService>
  try {
    service = getAppealService()
  } catch {
    return NextResponse.json({ error: 'Appeal service not initialized' }, { status: 503 })
  }

  try {
    const payload = appealInputSchema.parse(await request.json())
    const result = await service.submitAppeal(userId, payload)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten() },
        { status: 422 },
      )
    }
    if (error instanceof AppealTargetNotFoundError) {
      return NextResponse.json({ error: 'Appeal target not found' }, { status: 404 })
    }
    if (error instanceof AppealDeadlineExceededError) {
      return NextResponse.json(
        { error: 'Appeal deadline exceeded', deadline: error.deadline.toISOString() },
        { status: 422 },
      )
    }
    throw error
  }
}
