import { NextResponse } from 'next/server'
import { getAppealsKpi } from '@/lib/evaluation/appeal-review-data'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ kpi: getAppealsKpi() })
}
