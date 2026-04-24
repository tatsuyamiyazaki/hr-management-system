import { NextResponse, type NextRequest } from 'next/server'
import type { ReportType } from '@/lib/reports/report-types'

function parseReportType(value: string | null): ReportType {
  if (
    value === 'GOAL_ACHIEVEMENT' ||
    value === 'SKILL_DISTRIBUTION' ||
    value === 'ATTRITION_RISK'
  ) {
    return value
  }
  return 'EVALUATION_SUMMARY'
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const type = parseReportType(request.nextUrl.searchParams.get('type'))
  const content = [
    '%PDF-1.4',
    `% Report export: ${type}`,
    '1 0 obj << /Type /Catalog >> endobj',
    '%%EOF',
  ].join('\n')

  return new NextResponse(content, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${type.toLowerCase()}.pdf"`,
    },
  })
}
