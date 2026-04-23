/**
 * Issue #179 / Task 15.6 / Req 8.8, 8.9: 評価進捗表示・リマインダー画面
 *
 * - cycleId をクエリパラメータで受け取る
 * - GET  /api/evaluation/cycles/[id]/progress     — HR向け全体進捗（HR_MANAGER/ADMIN）
 * - GET  /api/evaluation/cycles/[id]/progress/me  — 個人進捗（全員）
 * - POST /api/evaluation/reminder/scan            — リマインダースキャン（ADMIN）
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EvaluatorProgressRecord {
  readonly evaluatorId: string
  readonly totalAssignments: number
  readonly submittedCount: number
  readonly pendingCount: number
}

interface CycleProgressRecord {
  readonly cycleId: string
  readonly totalEvaluators: number
  readonly fullySubmittedCount: number
  readonly evaluators: readonly EvaluatorProgressRecord[]
}

interface ReminderScanResult {
  readonly notified: number
  readonly skipped: number
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type ProgressState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'hidden' }
  | { readonly kind: 'ready'; readonly progress: CycleProgressRecord }

type MyProgressState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly progress: EvaluatorProgressRecord }

type ScanState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'scanning' }
  | { readonly kind: 'done'; readonly result: ReminderScanResult }
  | { readonly kind: 'error'; readonly message: string }

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
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes('403') || msg.includes('forbidden')
}

function pct(submitted: number, total: number): number {
  if (total === 0) return 0
  return Math.round((submitted / total) * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EvaluationProgressPage(): ReactElement {
  const searchParams = useSearchParams()
  const cycleId = searchParams.get('cycleId') ?? ''

  const [progressState, setProgressState] = useState<ProgressState>(
    cycleId ? { kind: 'loading' } : { kind: 'idle' },
  )
  const [myState, setMyState] = useState<MyProgressState>({ kind: 'loading' })
  const [scanState, setScanState] = useState<ScanState>({ kind: 'idle' })

  async function loadAll(): Promise<void> {
    if (!cycleId) return

    // Load personal progress (all roles)
    try {
      const my = await fetchJson<EvaluatorProgressRecord>(
        `/api/evaluation/cycles/${encodeURIComponent(cycleId)}/progress/me`,
      )
      setMyState({ kind: 'ready', progress: my })
    } catch (err) {
      setMyState({ kind: 'error', message: readError(err) })
    }

    // Load HR progress (HR_MANAGER/ADMIN only — 403 → hidden)
    try {
      const all = await fetchJson<CycleProgressRecord>(
        `/api/evaluation/cycles/${encodeURIComponent(cycleId)}/progress`,
      )
      setProgressState({ kind: 'ready', progress: all })
    } catch (err) {
      if (isForbidden(err)) {
        setProgressState({ kind: 'hidden' })
      } else {
        setProgressState({ kind: 'error', message: readError(err) })
      }
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId])

  async function handleScan(): Promise<void> {
    setScanState({ kind: 'scanning' })
    try {
      const result = await fetchJson<ReminderScanResult>('/api/evaluation/reminder/scan', {
        method: 'POST',
      })
      setScanState({ kind: 'done', result })
    } catch (err) {
      setScanState({ kind: 'error', message: readError(err) })
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            360度評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">進捗確認</h1>
          <p className="mt-2 text-sm text-slate-600">
            評価の提出状況を確認します。リマインダー通知は ADMIN のみ実行できます。
          </p>
          {cycleId && (
            <p className="mt-1 text-xs text-slate-500">
              サイクル ID: <span className="font-mono">{cycleId}</span>
            </p>
          )}
        </div>
        <a
          href="/evaluation/cycles"
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← サイクル一覧
        </a>
      </header>

      {!cycleId ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          URL に <span className="font-mono">?cycleId=...</span> を付けてアクセスしてください
        </div>
      ) : (
        <div className="space-y-6">
          {/* My progress */}
          <MyProgressSection state={myState} />

          {/* HR full progress */}
          {progressState.kind !== 'hidden' && <HrProgressSection state={progressState} />}

          {/* Reminder scan (ADMIN) */}
          <ReminderSection scanState={scanState} onScan={() => void handleScan()} />
        </div>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MyProgressSection
// ─────────────────────────────────────────────────────────────────────────────

function MyProgressSection({ state }: { readonly state: MyProgressState }): ReactElement {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-slate-800">自分の進捗</h2>
      {state.kind === 'loading' && (
        <div className="text-center text-sm text-slate-400">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      )}
      {state.kind === 'error' && <p className="text-sm text-rose-600">{state.message}</p>}
      {state.kind === 'ready' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <Stat label="割り当て総数" value={state.progress.totalAssignments} />
            <Stat label="提出済み" value={state.progress.submittedCount} color="text-emerald-600" />
            <Stat label="未提出" value={state.progress.pendingCount} color="text-rose-600" />
          </div>
          <ProgressBar
            submitted={state.progress.submittedCount}
            total={state.progress.totalAssignments}
          />
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HrProgressSection
// ─────────────────────────────────────────────────────────────────────────────

function HrProgressSection({ state }: { readonly state: ProgressState }): ReactElement {
  if (state.kind === 'idle') return <></>

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-slate-800">全体進捗（HR 向け）</h2>

      {state.kind === 'loading' && (
        <div className="text-center text-sm text-slate-400">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      )}
      {state.kind === 'error' && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">データの取得に失敗しました</p>
          <p className="mt-1 text-xs">{state.message}</p>
        </div>
      )}
      {state.kind === 'ready' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
            <Stat label="評価者総数" value={state.progress.totalEvaluators} />
            <Stat
              label="全提出完了"
              value={state.progress.fullySubmittedCount}
              color="text-emerald-600"
            />
            <Stat
              label="完了率"
              value={`${pct(state.progress.fullySubmittedCount, state.progress.totalEvaluators)}%`}
              color="text-indigo-600"
            />
          </div>
          <ProgressBar
            submitted={state.progress.fullySubmittedCount}
            total={state.progress.totalEvaluators}
          />

          {state.progress.evaluators.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-medium text-slate-500">評価者別進捗</h3>
              <div className="overflow-hidden rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                        評価者 ID
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">
                        割り当て
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">
                        提出済み
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">
                        未提出
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                        進捗
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.progress.evaluators.map((ev) => (
                      <tr key={ev.evaluatorId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">
                          {ev.evaluatorId}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-slate-600">
                          {ev.totalAssignments}
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-medium text-emerald-600">
                          {ev.submittedCount}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-rose-600">
                          {ev.pendingCount}
                        </td>
                        <td className="px-3 py-2">
                          <MiniProgressBar
                            submitted={ev.submittedCount}
                            total={ev.totalAssignments}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReminderSection
// ─────────────────────────────────────────────────────────────────────────────

function ReminderSection({
  scanState,
  onScan,
}: {
  readonly scanState: ScanState
  readonly onScan: () => void
}): ReactElement {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-800">リマインダー通知（ADMIN 専用）</h2>
      <p className="mb-4 text-xs text-slate-500">
        締切 3 日前のアクティブなサイクルの未提出者に通知を送ります。
      </p>

      {scanState.kind === 'idle' && (
        <button
          type="button"
          onClick={onScan}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          リマインダーを送信
        </button>
      )}
      {scanState.kind === 'scanning' && (
        <p className="text-sm text-slate-500">
          <span className="animate-pulse">スキャン中…</span>
        </p>
      )}
      {scanState.kind === 'done' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">スキャン完了</p>
          <div className="mt-2 flex gap-6 text-sm text-emerald-700">
            <span>
              通知送信: <strong>{scanState.result.notified}</strong> 件
            </span>
            <span>
              スキップ: <strong>{scanState.result.skipped}</strong> 件
            </span>
          </div>
        </div>
      )}
      {scanState.kind === 'error' && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">エラーが発生しました</p>
          <p className="mt-1 text-xs text-rose-700">{scanState.message}</p>
          {(scanState.message.toLowerCase().includes('403') ||
            scanState.message.toLowerCase().includes('forbidden')) && (
            <p className="mt-1 text-xs text-rose-600">リマインダー送信には ADMIN 権限が必要です</p>
          )}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  color = 'text-slate-900',
}: {
  readonly label: string
  readonly value: number | string
  readonly color?: string
}): ReactElement {
  return (
    <div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

function ProgressBar({
  submitted,
  total,
}: {
  readonly submitted: number
  readonly total: number
}): ReactElement {
  const p = pct(submitted, total)
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>完了率</span>
        <span>{p}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  )
}

function MiniProgressBar({
  submitted,
  total,
}: {
  readonly submitted: number
  readonly total: number
}): ReactElement {
  const p = pct(submitted, total)
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${p === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="text-xs text-slate-500">{p}%</span>
    </div>
  )
}
