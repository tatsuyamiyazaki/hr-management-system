import { NextResponse } from 'next/server'
import { getSkillDistributionReport } from '@/lib/reports/report-data'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getSkillDistributionReport())
}
