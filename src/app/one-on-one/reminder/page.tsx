/**
 * Issue #178 / Task 14.3 / Req 7.6, 7.7, 7.8: ログ未入力リマインダー / 評価フォーム連携画面
 *
 * - POST /api/one-on-one/reminder/scan                              → スキャン実行（ADMIN のみ）
 * - GET  /api/one-on-one/evaluation-links?employeeId=...&from=...&to=... → 評価フォームリンク
 * - GET  /api/one-on-one/admin/logs?page=1&limit=20                 → 全ログ一覧（HR_MANAGER+、403 は非表示）
 */
'use client'

import { useEffect, useState, type ReactElement, type ChangeEvent } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AllLogEntry {
  readonly logId: string
  readonly sessionId: string
  readonly managerId: string
  readonly employeeId: string
  readonly scheduledAt: string
  readonly content: string
  readonly visibility: 'MANAGER_ONLY' | 'BOTH'
  readonly recordedAt: string
}

interface EvaluationLogLink {
  readonly sessionId: string
  readonly scheduledAt: string
  readonly logId: string | null
  readonly hasLog: boolean
}

interface ScanResult {
  readonly notified: number
  readonly skipped: number
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

interface PaginatedData {
  readonly data: readonly AllLogEntry[]
  readonly total: number
}

type AdminLogsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'hidden' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly logs: readonly AllLogEntry[]; readonly total: number }

type EvalLinksState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly links: readonly EvaluationLogLink[] }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...options })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? null) as T
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

function isForbidden(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('403') || msg.includes('forbidden')
  }
  return false
}

function formatDateTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ReminderPage(): ReactElement {
  const [adminLogsState, setAdminLogsState] = useState<AdminLogsState>({ kind: 'loading' })
  const [page, setPage] = useState(1)
  const limit = 20

  const [evalEmployeeId, setEvalEmployeeId] = useState('')
  const [evalFrom, setEvalFrom] = useState('')
  const [evalTo, setEvalTo] = useState('')
  const [evalLinksState, setEvalLinksState] = useState<EvalLinksState>({ kind: 'idle' })

  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  useEffect(() => {
    void loadAdminLogs(page)
  }, [page])

  async function loadAdminLogs(p: number): Promise<void> {
    setAdminLogsState({ kind: 'loading' })
    try {
      const result = await fetchJson<PaginatedData>(
        `/api/one-on-one/admin/logs?page=${p}&limit=${limit}`,
      )
      setAdminLogsState({
        kind: 'ready',
        logs: result?.data ?? [],
        total: result?.total ?? 0,
      })
    } catch (err) {
      if (isForbidden(err)) {
        setAdminLogsState({ kind: 'hidden' })
      } else {
        setAdminLogsState({ kind: 'error', message: readError(err) })
      }
    }
  }

  async function handleScan(): Promise<void> {
    setScanning(true)
    setScanError(null)
    setScanResult(null)
    try {
      const result = await fetchJson<ScanResult>('/api/one-on-one/reminder/scan', {
        method: 'POST',
      })
      setScanResult(result)
    } catch (err) {
      if (isForbidden(err)) {
        setScanError('リマインダースキャンには ADMIN 権限が必要です')
      } else {
        setScanError(readError(err))
      }
    } finally {
      setScanning(false)
    }
  }

  async function handleEvalLinksSearch(): Promise<void> {
    if (!evalEmployeeId) return
    setEvalLinksState({ kind: 'loading' })
    try {
      const params = new URLSearchParams({ employeeId: evalEmployeeId })
      if (evalFrom) params.set('from', evalFrom)
      if (evalTo) params.set('to', evalTo)
      const links = await fetchJson<EvaluationLogLink[]>(
        `/api/one-on-one/evaluation-links?${params.toString()}`,
      )
      setEvalLinksState({ kind: 'ready', links: Array.isArray(links) ? links : [] })
    } catch (err) {
      setEvalLinksState({ kind: 'error', message: readError(err) })
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">1on1</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">リマインダー / 評価連携</h1>
        <p className="mt-2 text-sm text-slate-600">
          ログ未入力の確認、リマインダー送信、評価フォームへの 1on1 記録参照を行います。
        </p>
      </header>

      {/* ── Reminder scan (ADMIN) ── */}
      <section className="mb-10 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="mb-1 font-semibold text-slate-800">リマインダースキャン</h2>
        <p className="mb-4 text-xs text-slate-500">
          30 日以上 1on1 ログがない部下を検出し、担当マネージャーへ通知します（ADMIN 専用）。
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void handleScan()}
            disabled={scanning}
            className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {scanning ? 'スキャン中…' : 'スキャン実行'}
          </button>
          {scanResult && (
            <p className="text-sm text-slate-700">
              通知済み:{' '}
              <span className="font-semibold text-emerald-600">{scanResult.notified}</span> 件 /
              スキップ: <span className="font-semibold text-slate-500">{scanResult.skipped}</span>{' '}
              件
            </p>
          )}
          {scanError && <p className="text-sm text-rose-600">{scanError}</p>}
        </div>
      </section>

      {/* ── Evaluation links ── */}
      <section className="mb-10">
        <h2 className="mb-4 font-semibold text-slate-800">評価フォーム用 1on1 ログ参照</h2>
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              社員 ID <span className="text-rose-500">*</span>
            </label>
            <input
              value={evalEmployeeId}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEvalEmployeeId(e.target.value)}
              placeholder="社員 ID を入力"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">開始日（任意）</label>
            <input
              type="date"
              value={evalFrom}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEvalFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">終了日（任意）</label>
            <input
              type="date"
              value={evalTo}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEvalTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleEvalLinksSearch()}
            disabled={!evalEmployeeId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            参照
          </button>
        </div>

        <EvalLinksResult state={evalLinksState} />
      </section>

      {/* ── Admin all logs (HR_MANAGER+) ── */}
      {adminLogsState.kind !== 'hidden' && (
        <section>
          <h2 className="mb-4 font-semibold text-slate-800">全 1on1 ログ一覧</h2>
          <AdminLogsSection
            state={adminLogsState}
            page={page}
            limit={limit}
            onPageChange={setPage}
          />
        </section>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EvalLinksResult
// ─────────────────────────────────────────────────────────────────────────────

function EvalLinksResult({ state }: { readonly state: EvalLinksState }): ReactElement {
  if (state.kind === 'idle') return <></>
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-8 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-semibold">取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }
  if (state.links.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-400">
        該当期間のセッションが見つかりません
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">予定日時</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">ログ状態</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
              セッション ID
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.links.map((link) => (
            <tr key={link.sessionId} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-700">{formatDateTime(link.scheduledAt)}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    link.hasLog ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                  }`}
                >
                  {link.hasLog ? '記録あり' : '未記録'}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">{link.sessionId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminLogsSection
// ─────────────────────────────────────────────────────────────────────────────

function AdminLogsSection({
  state,
  page,
  limit,
  onPageChange,
}: {
  readonly state: AdminLogsState
  readonly page: number
  readonly limit: number
  readonly onPageChange: (p: number) => void
}): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">データの取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }
  if (state.kind !== 'ready' || state.logs.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
        ログデータがありません
      </div>
    )
  }

  const totalPages = Math.ceil(state.total / limit)

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">予定日時</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                マネージャー
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">部下</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">公開範囲</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">記録日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {state.logs.map((log) => (
              <tr key={log.logId} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700">{formatDateTime(log.scheduledAt)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{log.managerId}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{log.employeeId}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      log.visibility === 'BOTH'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {log.visibility === 'BOTH' ? '本人にも公開' : 'マネージャーのみ'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{log.recordedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {state.total} 件中 {(page - 1) * limit + 1}–{Math.min(page * limit, state.total)} 件
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40"
            >
              ← 前へ
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40"
            >
              次へ →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
