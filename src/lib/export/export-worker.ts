import type { Job } from 'bullmq'
import type { BlobStorage } from './blob-storage'
import { createLocalBlobStorage } from './blob-storage'
import { isExportRequest } from './export-types'
import type { ExportJobResult, ExportRequest } from './export-types'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import {
  generateGradeCsv,
  generateRoleCsv,
  generateSkillCsv,
  isMasterResource,
  type GradeMasterRow,
  type RoleMasterRow,
  type SkillMasterRow,
} from '@/lib/master/master-csv'

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（テスト可能な純粋関数として分離）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * export-csv ジョブを処理し、Blob キーを返す。
 * ストレージは依存性注入で受け取ることでテスタブルにする。
 */
export async function processExportJob(job: Job, storage: BlobStorage): Promise<ExportJobResult> {
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

function generateContent(payload: ExportRequest): string {
  switch (payload.type) {
    case 'MasterCsv':
      return generateMasterCsv(payload.resource)

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

// ─────────────────────────────────────────────────────────────────────────────
// MasterCsv 生成（Issue #26）
// 実 DB 読み出しは MasterRepository（後続タスク）に移す前提の空データスタブ。
// ここでは resource 判別とヘッダ付き CSV 生成の責務までを確定させる。
// ─────────────────────────────────────────────────────────────────────────────

function generateMasterCsv(resource: string): string {
  if (!isMasterResource(resource)) {
    // 不明 resource: ヘッダのみの空 CSV は誤解を招くため、明示的にエラーメッセージを残す
    return `# error: 未対応のマスタリソースです: "${resource}"\n`
  }

  switch (resource) {
    case 'skill': {
      const rows: SkillMasterRow[] = []
      return generateSkillCsv(rows)
    }
    case 'role': {
      const rows: RoleMasterRow[] = []
      return generateRoleCsv(rows)
    }
    case 'grade': {
      const rows: GradeMasterRow[] = []
      return generateGradeCsv(rows)
    }
  }
}

function getExtension(payload: ExportRequest): string {
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
