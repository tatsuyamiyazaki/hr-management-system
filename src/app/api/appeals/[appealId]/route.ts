import { type NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getAppSession } from '@/lib/auth/app-session'
import { getAppealService } from '@/lib/appeal/appeal-service-di'
import {
  AppealInvalidStatusTransitionError,
  AppealNotFoundError,
  appealReviewInputSchema,
} from '@/lib/appeal/appeal-types'

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ appealId: string }> },
): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = getSessionRole(session)
  if (!isAllowedRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = getSessionUserId(session)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let service: ReturnType<typeof getAppealService>
  try {
    service = getAppealService()
  } catch {
    return NextResponse.json({ error: 'Appeal service not initialized' }, { status: 503 })
  }

  try {
    const payload = appealReviewInputSchema.parse(await request.json())
    const { appealId } = await context.params
    const result = await service.review(userId, appealId, payload)
    return NextResponse.json({ success: true, data: result }, { status: 200 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten() },
        { status: 422 },
      )
    }
    if (error instanceof AppealNotFoundError) {
      return NextResponse.json({ error: 'Appeal not found' }, { status: 404 })
    }
    if (error instanceof AppealInvalidStatusTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
