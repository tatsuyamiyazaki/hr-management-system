/**
 * Issue #174 / Task 9.1 / Req 14.1, 14.9: 社員データ一括インポート画面
 *
 * - HR_MANAGER / ADMIN のみアクセス可能
 * - CSVファイルを選択して POST /api/lifecycle/employees/import に送信
 * - アップロード結果（成功件数・エラー行）を表示
 */
'use client'

import { useCallback, useRef, useState, type ReactElement } from 'react'

interface ImportRow {
  readonly row: number
  readonly error: string
}

interface BulkImportResult {
  readonly total: number
  readonly succeeded: number
  readonly failed: number
  readonly errors: readonly ImportRow[]
}

interface ImportEnvelope {
  readonly success?: boolean
  readonly data?: BulkImportResult
  readonly error?: string
  readonly succeeded?: number
  readonly failed?: number
  readonly errors?: readonly ImportRow[]
}

type UploadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading' }
  | { readonly kind: 'success'; readonly result: BulkImportResult }
  | { readonly kind: 'error'; readonly message: string }

const IMPORT_URL = '/api/lifecycle/employees/import'
const MAX_FILE_SIZE_MB = 5

export default function EmployeeImportPage(): ReactElement {
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    setUploadState({ kind: 'idle' })
  }, [])

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return
    if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setUploadState({
        kind: 'error',
        message: `ファイルサイズが ${MAX_FILE_SIZE_MB}MB を超えています`,
      })
      return
    }

    setUploadState({ kind: 'uploading' })
    const form = new FormData()
    form.append('file', selectedFile)

    try {
      const res = await fetch(IMPORT_URL, { method: 'POST', body: form })
      const payload = (await res.json().catch(() => ({}))) as ImportEnvelope

      if (!res.ok && res.status !== 207) {
        throw new Error(payload.error ?? `HTTP ${res.status}`)
      }

      const result: BulkImportResult = payload.data ?? {
        total: (payload.succeeded ?? 0) + (payload.failed ?? 0),
        succeeded: payload.succeeded ?? 0,
        failed: payload.failed ?? 0,
        errors: payload.errors ?? [],
      }
      setUploadState({ kind: 'success', result })
    } catch (err) {
      setUploadState({ kind: 'error', message: readError(err) })
    }
  }, [selectedFile])

  const handleReset = useCallback(() => {
    setSelectedFile(null)
    setUploadState({ kind: 'idle' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Employees</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">社員一括インポート</h1>
        <p className="mt-2 text-sm text-slate-600">
          CSVファイルから社員データを一括登録します。最大 {MAX_FILE_SIZE_MB}MB まで。
        </p>
      </header>

      <section className="space-y-6">
        <CsvFormatGuide />

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">CSVファイルを選択</h2>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
          />

          {selectedFile !== null && (
            <p className="text-xs text-slate-500">
              選択中: <span className="font-medium text-slate-700">{selectedFile.name}</span> (
              {(selectedFile.size / 1024).toFixed(1)} KB)
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleUpload}
              disabled={selectedFile === null || uploadState.kind === 'uploading'}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {uploadState.kind === 'uploading' ? 'インポート中…' : 'インポート実行'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={uploadState.kind === 'uploading'}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              リセット
            </button>
          </div>
        </div>

        <UploadResult state={uploadState} />
      </section>
    </main>
  )
}

function CsvFormatGuide(): ReactElement {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-800">
      <p className="mb-1 font-semibold">CSVフォーマット（1行目はヘッダー）</p>
      <p className="rounded bg-white/60 px-2 py-1 font-mono">
        email,firstName,lastName,hireDate,departmentId,positionId,role
      </p>
      <p className="mt-2 text-indigo-600">
        ※ hireDate は YYYY-MM-DD 形式。role は EMPLOYEE / MANAGER / HR_MANAGER / ADMIN のいずれか。
      </p>
    </div>
  )
}

interface UploadResultProps {
  readonly state: UploadState
}

function UploadResult({ state }: UploadResultProps): ReactElement | null {
  if (state.kind === 'idle' || state.kind === 'uploading') return null

  if (state.kind === 'error') {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-semibold">インポートに失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }

  const { result } = state
  const allSuccess = result.failed === 0

  return (
    <div
      className={`rounded-lg border p-4 text-sm ${
        allSuccess
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-amber-300 bg-amber-50 text-amber-800'
      }`}
    >
      <p className="font-semibold">
        {allSuccess ? 'インポート完了' : 'インポート完了（一部エラーあり）'}
      </p>
      <p className="mt-1 text-xs">
        総件数: {result.total} / 成功: {result.succeeded} / 失敗: {result.failed}
      </p>
      {result.errors.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-current/20 pt-3 text-xs">
          {result.errors.map((e) => (
            <li key={e.row} className="flex gap-2">
              <span className="shrink-0 font-mono font-semibold">{e.row}行目:</span>
              <span>{e.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}
