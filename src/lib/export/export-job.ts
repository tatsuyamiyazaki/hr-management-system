import type { JobQueue } from '@/lib/jobs/job-queue'
import { createJobQueue } from '@/lib/jobs/job-queue'
import type { BlobStorage } from './blob-storage'
import { createLocalBlobStorage } from './blob-storage'
import type { ExportJobId, ExportJobStatus, ExportRequest } from './export-types'
import type { JobState } from '@/lib/jobs/job-types'

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ JobState → ExportJobStatus マッピング
// ─────────────────────────────────────────────────────────────────────────────

const SIGNED_URL_TTL_SECONDS = 86_400 // 24h

function toExportStatus(state: JobState): ExportJobStatus {
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

export interface ExportJob {
  /** エクスポートジョブをキューに投入し、jobId を返す */
  enqueue(request: ExportRequest): Promise<{ jobId: ExportJobId }>

  /** ジョブのステータスを返す（存在しない場合は null） */
  getStatus(jobId: ExportJobId): Promise<ExportJobStatus | null>

  /**
   * 完了済みジョブの署名付きダウンロード URL を返す
   * ジョブが存在しない・未完了の場合は null
   */
  getDownloadUrl(jobId: ExportJobId): Promise<{ url: string; expiresAt: string } | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class BullMQExportJob implements ExportJob {
  constructor(
    private readonly queue: JobQueue,
    private readonly storage: BlobStorage,
  ) {}

  async enqueue(request: ExportRequest): Promise<{ jobId: ExportJobId }> {
    const jobId = await this.queue.enqueue('export-csv', request)
    return { jobId: jobId as ExportJobId }
  }

  async getStatus(jobId: ExportJobId): Promise<ExportJobStatus | null> {
    const status = await this.queue.getJobStatus(jobId)
    if (!status) return null
    return toExportStatus(status.state)
  }

  async getDownloadUrl(jobId: ExportJobId): Promise<{ url: string; expiresAt: string } | null> {
    const status = await this.queue.getJobStatus(jobId)
    if (!status || status.state !== 'completed') return null

    const result = status.returnValue as { blobKey?: string } | null
    if (!result?.blobKey) return null

    return this.storage.getSignedUrl(result.blobKey, SIGNED_URL_TTL_SECONDS)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createExportJob(queue?: JobQueue, storage?: BlobStorage): ExportJob {
  return new BullMQExportJob(
    queue ?? createJobQueue(),
    storage ?? createLocalBlobStorage(),
  )
}
