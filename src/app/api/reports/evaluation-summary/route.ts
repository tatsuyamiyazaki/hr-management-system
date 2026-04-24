import { NextResponse, type NextRequest } from 'next/server'
import { getDepartmentCompletions } from '@/lib/reports/report-data'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const period = request.nextUrl.searchParams.get('period') ?? '2026-Q1'

  return NextResponse.json({
    selectedReport: 'EVALUATION_SUMMARY',
    period,
    chartData: getDepartmentCompletions(period),
  })
}
