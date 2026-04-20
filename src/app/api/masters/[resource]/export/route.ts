/**
 * Issue #26: マスタ CSV エクスポート API
 *
 * POST /api/masters/:resource/export
 * - resource は `skill` / `role` / `grade` のみ許可
 * - BullMQ (export-csv キュー) に MasterCsv ジョブを投入
 * - 成功時: { jobId }
 */
import { type NextRequest, NextResponse } from 'next/server'
import { isMasterResource } from '@/lib/master/master-csv'
import { getExportJob } from '@/lib/master/master-job-di'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
): Promise<NextResponse> {
  const { resource } = await params

  if (!isMasterResource(resource)) {
    return NextResponse.json(
      { error: `Invalid resource: "${resource}". Allowed: skill | role | grade` },
      { status: 400 },
    )
  }

  let job: ReturnType<typeof getExportJob>
  try {
    job = getExportJob()
  } catch {
    return NextResponse.json({ error: 'ExportJob service not initialized' }, { status: 503 })
  }

  try {
    const { jobId } = await job.enqueue({ type: 'MasterCsv', resource })
    return NextResponse.json({ jobId }, { status: 202 })
  } catch {
    return NextResponse.json({ error: 'Failed to enqueue export job' }, { status: 500 })
  }
}
