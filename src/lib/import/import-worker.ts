import { type Job } from 'bullmq'
import { isImportRequest } from './import-types'
import type { ImportResult, ImportRowError } from './import-types'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import {
  isMasterResource,
  parseGradeCsv,
  parseRoleCsv,
  parseSkillCsv,
  type MasterResource,
} from '@/lib/master/master-csv'
import { parseEmployeeCsv } from '@/lib/lifecycle/employee-csv'

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（テスト可能な純粋関数として分離）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * import-csv ジョブを処理し、ImportResult を返す。
 * ペイロードに付与された csvContent（任意フィールド）をパースし、バリデーション結果を返す。
 * 実際の DB 書き込みは MasterRepository（後続タスクで結合）に委譲する前提の
 * スタブ実装。ここでは successCount = 有効行数 を返す。
 */
export async function processImportJob(job: Job): Promise<ImportResult> {
  const payload = job.data as unknown

  if (!isImportRequest(payload)) {
    throw new Error(`ImportWorker: invalid payload for job "${job.id ?? 'unknown'}"`)
  }

  const csvContent = extractCsvContent(job.data)

  if (payload.type === 'MasterCsv') {
    return processMasterCsv(payload.resource, csvContent)
  }
  return processEmployeeCsv(csvContent)
}

// ─────────────────────────────────────────────────────────────────────────────
// バリアント別処理
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MasterCsv バリアントの実処理。
 * - resource が未知ならエラーを 1 件返す
 * - 有効な resource なら CSV をパースしてエラーを ImportRowError[] に集約
 */
function processMasterCsv(resource: string, csvContent: string): ImportResult {
  if (!isMasterResource(resource)) {
    return buildResourceError(resource)
  }

  const { rows, errors } = parseByResource(resource, csvContent)
  const successCount = rows.length
  const failureCount = errors.length
  return {
    totalRows: successCount + failureCount,
    successCount,
    failureCount,
    errors,
  }
}

function parseByResource(
  resource: MasterResource,
  csvContent: string,
): { rows: unknown[]; errors: ImportRowError[] } {
  switch (resource) {
    case 'skill':
      return parseSkillCsv(csvContent)
    case 'role':
      return parseRoleCsv(csvContent)
    case 'grade':
      return parseGradeCsv(csvContent)
  }
}

function buildResourceError(resource: string): ImportResult {
  const err: ImportRowError = {
    rowNumber: 1,
    field: 'resource',
    message: `未対応のマスタリソースです: "${resource}"`,
  }
  return { totalRows: 1, successCount: 0, failureCount: 1, errors: [err] }
}

/**
 * Issue #29: EmployeeCsv バリアントの実処理。
 * CSV をパースして ImportRowError[] に集約する。
 * 実際の DB 書き込みは LifecycleService (API 層) が担う。
 */
function processEmployeeCsv(csvContent: string): ImportResult {
  if (csvContent.length === 0) {
    return { totalRows: 0, successCount: 0, failureCount: 0, errors: [] }
  }
  const { rows, errors } = parseEmployeeCsv(csvContent)
  const successCount = rows.length
  const failureCount = errors.length
  return {
    totalRows: successCount + failureCount,
    successCount,
    failureCount,
    errors,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// payload ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ジョブペイロードに付与された csvContent（ImportRequest スキーマ外の任意フィールド）を
 * 安全に取り出す。BullMQ は余剰フィールドを保持するため、API 層で含めて enqueue する。
 */
function extractCsvContent(data: unknown): string {
  if (typeof data !== 'object' || data === null) return ''
  const obj = data as Record<string, unknown>
  return typeof obj.csvContent === 'string' ? obj.csvContent : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

export function createImportWorker() {
  return createBaseWorker('import-csv', (job: Job) => processImportJob(job))
}
