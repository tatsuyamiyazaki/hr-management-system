import { type Job } from 'bullmq'
import { isImportRequest } from './import-types'
import type { ImportResult } from './import-types'
import { createBaseWorker } from '@/lib/jobs/base-worker'

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（テスト可能な純粋関数として分離）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * import-csv ジョブを処理し、ImportResult を返す。
 * 実際の CSV パースと DB 書き込みは各ドメインサービスが担当する予定。
 */
export async function processImportJob(job: Job): Promise<ImportResult> {
  const payload = job.data as unknown

  if (!isImportRequest(payload)) {
    throw new Error(`ImportWorker: invalid payload for job "${job.id ?? 'unknown'}"`)
  }

  return processVariant(payload.type)
}

// ─────────────────────────────────────────────────────────────────────────────
// バリアント別処理（スタブ実装）
// 実際のデータ取得・バリデーションは各ドメインサービスが担当する予定
// ─────────────────────────────────────────────────────────────────────────────

function processVariant(type: 'MasterCsv' | 'EmployeeCsv'): ImportResult {
  switch (type) {
    case 'MasterCsv':
      return { totalRows: 0, successCount: 0, failureCount: 0, errors: [] }
    case 'EmployeeCsv':
      return { totalRows: 0, successCount: 0, failureCount: 0, errors: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

export function createImportWorker() {
  return createBaseWorker('import-csv', (job: Job) => processImportJob(job))
}
