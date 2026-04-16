import type { Job } from 'bullmq'
import type { BlobStorage } from './blob-storage'
import { createLocalBlobStorage } from './blob-storage'
import { isExportRequest } from './export-types'
import type { ExportJobResult } from './export-types'
import { createBaseWorker } from '@/lib/jobs/base-worker'

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（テスト可能な純粋関数として分離）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * export-csv ジョブを処理し、Blob キーを返す。
 * ストレージは依存性注入で受け取ることでテスタブルにする。
 */
export async function processExportJob(
  job: Job,
  storage: BlobStorage,
): Promise<ExportJobResult> {
  const payload = job.data as unknown

  if (!isExportRequest(payload)) {
    throw new Error(`ExportWorker: invalid payload for job "${job.id ?? 'unknown'}"`)
  }

  const csvContent = generateContent(payload)
  const ext = getExtension(payload)
  const path = `exports/${job.id ?? 'unknown'}-${Date.now()}.${ext}`

  const blobKey = await storage.upload(path, Buffer.from(csvContent, 'utf8'))
  return { blobKey }
}

// ─────────────────────────────────────────────────────────────────────────────
// コンテンツ生成（各バリアントのスタブ）
// 実際のデータ取得は各ドメインサービスが担当する予定
// ─────────────────────────────────────────────────────────────────────────────

function generateContent(payload: ReturnType<typeof import('./export-types').exportRequestSchema.parse>): string {
  switch (payload.type) {
    case 'MasterCsv':
      return `resource,id,name\n${payload.resource},,,`

    case 'OrganizationCsv':
      return 'org_id,name,parent_org_id\n'

    case 'EvaluationReport':
      return payload.format === 'pdf'
        ? `%PDF-1.4 stub for cycleId=${payload.cycleId}`
        : `cycle_id,employee_id,score\n${payload.cycleId},,,`

    case 'AuditLog':
      return 'occurred_at,action,resource_type,resource_id,actor_id\n'
  }
}

function getExtension(payload: ReturnType<typeof import('./export-types').exportRequestSchema.parse>): string {
  if (payload.type === 'EvaluationReport' && payload.format === 'pdf') {
    return 'pdf'
  }
  return 'csv'
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

export function createExportWorker(storage?: BlobStorage) {
  const blobStorage = storage ?? createLocalBlobStorage()

  return createBaseWorker('export-csv', (job) => processExportJob(job, blobStorage))
}
