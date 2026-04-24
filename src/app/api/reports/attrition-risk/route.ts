import { NextResponse } from 'next/server'
import { getAttritionRiskReport } from '@/lib/reports/report-data'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getAttritionRiskReport())
}
