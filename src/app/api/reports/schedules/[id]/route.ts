import { NextResponse, type NextRequest } from 'next/server'
import { updateReportSchedule } from '@/lib/reports/report-data'

interface RouteContext {
  readonly params: Promise<{
    readonly id: string
  }>
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const updated = updateReportSchedule(id, {
    recipients: typeof body.recipients === 'string' ? body.recipients : undefined,
    frequency:
      body.frequency === 'WEEKLY' || body.frequency === 'MONTHLY' || body.frequency === 'QUARTERLY'
        ? body.frequency
        : undefined,
    nextDelivery: typeof body.nextDelivery === 'string' ? body.nextDelivery : undefined,
  })

  if (!updated) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
  }

  return NextResponse.json(updated)
}
