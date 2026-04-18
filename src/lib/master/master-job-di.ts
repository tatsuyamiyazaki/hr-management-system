/**
 * Issue #26: マスタ CSV 用 ImportJob / ExportJob の DI モジュール
 *
 * invitation-service-di.ts と同じシングルトン DI パターン。
 * - テスト時は setXxxForTesting() で差し替え
 * - プロダクションではサーバー起動時に initXxx() で実体を注入
 */
import type { ImportJob } from '@/lib/import/import-job'
import type { ExportJob } from '@/lib/export/export-job'

// ─────────────────────────────────────────────────────────────────────────────
// ImportJob
// ─────────────────────────────────────────────────────────────────────────────

let _importJob: ImportJob | null = null

export function setImportJobForTesting(job: ImportJob): void {
  _importJob = job
}

export function clearImportJobForTesting(): void {
  _importJob = null
}

export function getImportJob(): ImportJob {
  if (_importJob) return _importJob
  throw new Error(
    'ImportJob is not initialized. ' +
      'テストでは setImportJobForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initImportJob() を呼んでください。',
  )
}

export function initImportJob(job: ImportJob): void {
  _importJob = job
}

// ─────────────────────────────────────────────────────────────────────────────
// ExportJob
// ─────────────────────────────────────────────────────────────────────────────

let _exportJob: ExportJob | null = null

export function setExportJobForTesting(job: ExportJob): void {
  _exportJob = job
}

export function clearExportJobForTesting(): void {
  _exportJob = null
}

export function getExportJob(): ExportJob {
  if (_exportJob) return _exportJob
  throw new Error(
    'ExportJob is not initialized. ' +
      'テストでは setExportJobForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initExportJob() を呼んでください。',
  )
}

export function initExportJob(job: ExportJob): void {
  _exportJob = job
}
