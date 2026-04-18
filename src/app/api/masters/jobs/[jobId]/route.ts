/**
 * Issue #26: マスタ CSV ジョブステータス API
 *
 * GET /api/masters/jobs/:jobId
 * - import-csv / export-csv 両方のキューを検索
 * - import ジョブ: { kind: 'import', status, result? }
 * - export ジョブ: { kind: 'export', status, download? }
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getExportJob, getImportJob } from '@/lib/master/master-job-di'

export {
  setImportJobForTesting,
  clearImportJobForTesting,
  setExportJobForTesting,
  clearExportJobForTesting,
} from '@/lib/master/master-job-di'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params
  if (typeof jobId !== 'string' || jobId.length === 0) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const importResponse = await tryImport(jobId)
  if (importResponse) return importResponse

  const exportResponse = await tryExport(jobId)
  if (exportResponse) return exportResponse

  return NextResponse.json({ error: 'Job not found' }, { status: 404 })
}

async function tryImport(jobId: string): Promise<NextResponse | null> {
  let job: ReturnType<typeof getImportJob>
  try {
    job = getImportJob()
  } catch {
    return null
  }

  const status = await job.getStatus(jobId)
  if (!status) return null

  if (status === 'ready') {
    const result = await job.getResult(jobId)
    return NextResponse.json({ kind: 'import', status, result })
  }
  return NextResponse.json({ kind: 'import', status })
}

async function tryExport(jobId: string): Promise<NextResponse | null> {
  let job: ReturnType<typeof getExportJob>
  try {
    job = getExportJob()
  } catch {
    return null
  }

  const status = await job.getStatus(jobId)
  if (!status) return null

  if (status === 'ready') {
    const download = await job.getDownloadUrl(jobId)
    return NextResponse.json({ kind: 'export', status, download })
  }
  return NextResponse.json({ kind: 'export', status })
}
