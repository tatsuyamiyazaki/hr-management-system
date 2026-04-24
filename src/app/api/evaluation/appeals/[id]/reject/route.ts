import { NextResponse, type NextRequest } from 'next/server'
import { applyAppealAction } from '@/lib/evaluation/appeal-review-data'

interface RouteContext {
  readonly params: Promise<{
    readonly id: string
  }>
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params
  const appeal = applyAppealAction(id, 'reject')
  if (!appeal) {
    return NextResponse.json({ error: 'Appeal not found' }, { status: 404 })
  }
  return NextResponse.json({ appeal })
}
