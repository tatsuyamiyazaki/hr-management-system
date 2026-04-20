/**
 * Issue #26: マスタ CSV インポート API
 *
 * POST /api/masters/:resource/import
 * - resource は `skill` / `role` / `grade` のみ許可
 * - multipart/form-data の `file` フィールドで CSV を受け取る
 * - BullMQ (import-csv キュー) に MasterCsv ジョブを投入
 * - 成功時: { jobId }
 */
import { type NextRequest, NextResponse } from 'next/server'
import { isMasterResource } from '@/lib/master/master-csv'
import { getImportJob } from '@/lib/master/master-job-di'

const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
): Promise<NextResponse> {
  const { resource } = await params

  if (!isMasterResource(resource)) {
    return NextResponse.json(
      { error: `Invalid resource: "${resource}". Allowed: skill | role | grade` },
      { status: 400 },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart/form-data body' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field is required' }, { status: 422 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 422 })
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: `file exceeds ${MAX_CSV_BYTES} bytes` }, { status: 413 })
  }

  const csvContent = await file.text()

  let job: ReturnType<typeof getImportJob>
  try {
    job = getImportJob()
  } catch {
    return NextResponse.json({ error: 'ImportJob service not initialized' }, { status: 503 })
  }

  try {
    const { jobId } = await job.enqueue({
      type: 'MasterCsv',
      resource,
      csvContent,
    })
    return NextResponse.json({ jobId }, { status: 202 })
  } catch {
    return NextResponse.json({ error: 'Failed to enqueue import job' }, { status: 500 })
  }
}
