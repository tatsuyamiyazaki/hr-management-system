import type { JobQueue } from '@/lib/jobs/job-queue'
import { createJobQueue } from '@/lib/jobs/job-queue'
import type { ImportJobId, ImportJobStatus, ImportRequest, ImportResult } from './import-types'
import { importResultSchema } from './import-types'
import type { JobState } from '@/lib/jobs/job-types'

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ JobState → ImportJobStatus マッピング
// ─────────────────────────────────────────────────────────────────────────────

function toImportStatus(state: JobState): ImportJobStatus {
  switch (state) {
    case 'waiting':
    case 'waiting-children':
    case 'delayed':
    case 'prioritized':
      return 'queued'
    case 'active':
      return 'processing'
    case 'completed':
      return 'ready'
    case 'failed':
    case 'unknown':
      return 'failed'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportJob {
  /** インポートジョブをキューに投入し、jobId を返す */
  enqueue(request: ImportRequest): Promise<{ jobId: ImportJobId }>

  /** ジョブのステータスを返す（存在しない場合は null） */
  getStatus(jobId: ImportJobId): Promise<ImportJobStatus | null>

  /**
   * 完了済みジョブの結果を返す
   * ジョブが存在しない・未完了・結果が不正な場合は null
   */
  getResult(jobId: ImportJobId): Promise<ImportResult | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class BullMQImportJob implements ImportJob {
  constructor(private readonly queue: JobQueue) {}

  async enqueue(request: ImportRequest): Promise<{ jobId: ImportJobId }> {
    const jobId = await this.queue.enqueue('import-csv', request)
    return { jobId: jobId as ImportJobId }
  }

  async getStatus(jobId: ImportJobId): Promise<ImportJobStatus | null> {
    const status = await this.queue.getJobStatus(jobId)
    if (!status) return null
    return toImportStatus(status.state)
  }

  async getResult(jobId: ImportJobId): Promise<ImportResult | null> {
    const status = await this.queue.getJobStatus(jobId)
    if (!status || status.state !== 'completed') return null

    const parsed = importResultSchema.safeParse(status.returnValue)
    if (!parsed.success) return null

    return parsed.data
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createImportJob(queue?: JobQueue): ImportJob {
  return new BullMQImportJob(queue ?? createJobQueue())
}
