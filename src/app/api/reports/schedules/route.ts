import { NextResponse } from 'next/server'
import { getReportSchedules } from '@/lib/reports/report-data'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ schedules: getReportSchedules() })
}
