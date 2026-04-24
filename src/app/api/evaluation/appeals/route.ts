import { NextResponse, type NextRequest } from 'next/server'
import { listAppealsForReview } from '@/lib/evaluation/appeal-review-data'
import type { AppealStatus } from '@/lib/evaluation/appeal-types'

function parseStatus(value: string | null): AppealStatus {
  if (
    value === 'COMPLETED_CORRECTION' ||
    value === 'COMPLETED_REJECTED' ||
    value === 'PENDING_INFO'
  ) {
    return value
  }
  return 'UNDER_REVIEW'
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const status = parseStatus(request.nextUrl.searchParams.get('status'))
  return NextResponse.json({ appeals: listAppealsForReview(status) })
}
