/**
 * Issue #178 / Task 14.2 / Req 7.3, 7.4, 7.5: 1on1 ログ タイムライン画面
 *
 * - employeeId + managerId をクエリパラメータで受け取る
 * - GET /api/one-on-one/timeline?employeeId=...&managerId=... → タイムライン取得
 *   MANAGER: 全ログ表示、EMPLOYEE: visibility=BOTH のみ
 * - POST /api/one-on-one/sessions/[sessionId]/log → ログ記録（MANAGER のみ）
 */
'use client'

import { useEffect, useState, type ReactElement, type FormEvent, type ChangeEvent } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LogVisibility = 'MANAGER_ONLY' | 'BOTH'

interface OneOnOneLogRecord {
  readonly id: string
  readonly sessionId: string
  readonly agenda: string | null
  readonly content: string
  readonly nextActions: string | null
  readonly visibility: LogVisibility
  readonly recordedBy: string
  readonly recordedAt: string
}

interface TimelineEntry {
  readonly sessionId: string
  readonly scheduledAt: string
  readonly durationMin: number
  readonly log: OneOnOneLogRecord | null
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type TimelineState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly entries: readonly TimelineEntry[] }

interface LogFormValues {
  agenda: string
  content: string
  nextActions: string
  visibility: LogVisibility
}

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

function formatDateTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

const EMPTY_LOG_FORM: LogFormValues = {
  agenda: '',
  content: '',
  nextActions: '',
  visibility: 'MANAGER_ONLY',
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TimelinePage(): ReactElement {
  const searchParams = useSearchParams()
  const initialEmployee = searchParams.get('employeeId') ?? ''
  const initialManager = searchParams.get('managerId') ?? ''

  const [qEmployee, setQEmployee] = useState(initialEmployee)
  const [qManager, setQManager] = useState(initialManager)
  const [state, setState] = useState<TimelineState>(
    initialEmployee && initialManager ? { kind: 'loading' } : { kind: 'idle' },
  )

  async function load(eid: string, mid: string): Promise<void> {
    if (!eid || !mid) return
    setState({ kind: 'loading' })
    try {
      const entries = await fetchJson<TimelineEntry[]>(
        `/api/one-on-one/timeline?employeeId=${encodeURIComponent(eid)}&managerId=${encodeURIComponent(mid)}`,
      )
      setState({ kind: 'ready', entries: Array.isArray(entries) ? entries : [] })
    } catch (err) {
      setState({ kind: 'error', message: readError(err) })
    }
  }

  useEffect(() => {
    if (initialEmployee && initialManager) {
      void load(initialEmployee, initialManager)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(e: FormEvent): void {
    e.preventDefault()
    void load(qEmployee, qManager)
  }

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">1on1</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">タイムライン</h1>
        <p className="mt-2 text-sm text-slate-600">
          1on1 の記録を時系列で確認します。マネージャーはログを追加できます。
        </p>
      </header>

      {/* Search filter */}
      <form
        onSubmit={handleSearch}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            社員 ID <span className="text-rose-500">*</span>
          </label>
          <input
            required
            value={qEmployee}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQEmployee(e.target.value)}
            placeholder="部下の社員 ID"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            マネージャー ID <span className="text-rose-500">*</span>
          </label>
          <input
            required
            value={qManager}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQManager(e.target.value)}
            placeholder="マネージャーの社員 ID"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          表示
        </button>
      </form>

      <TimelineBody state={state} onLogAdded={() => void load(qEmployee, qManager)} />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TimelineBody
// ─────────────────────────────────────────────────────────────────────────────

function TimelineBody({
  state,
  onLogAdded,
}: {
  readonly state: TimelineState
  readonly onLogAdded: () => void
}): ReactElement {
  if (state.kind === 'idle') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        社員 ID とマネージャー ID を入力して「表示」を押してください
      </div>
    )
  }
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">データの取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }
  if (state.entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        タイムラインの記録がありません
      </div>
    )
  }

  const sorted = [...state.entries].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  )

  return (
    <div className="relative space-y-6">
      <div className="absolute top-0 left-4 h-full w-0.5 bg-slate-200" />
      {sorted.map((entry) => (
        <TimelineItem key={entry.sessionId} entry={entry} onLogAdded={onLogAdded} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TimelineItem
// ─────────────────────────────────────────────────────────────────────────────

function TimelineItem({
  entry,
  onLogAdded,
}: {
  readonly entry: TimelineEntry
  readonly onLogAdded: () => void
}): ReactElement {
  const [showLogForm, setShowLogForm] = useState(false)
  const [logForm, setLogForm] = useState<LogFormValues>(EMPTY_LOG_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  async function handleLogSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    setLogError(null)
    try {
      await fetchJson(`/api/one-on-one/sessions/${entry.sessionId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agenda: logForm.agenda || undefined,
          content: logForm.content,
          nextActions: logForm.nextActions || undefined,
          visibility: logForm.visibility,
        }),
      })
      setLogForm(EMPTY_LOG_FORM)
      setShowLogForm(false)
      onLogAdded()
    } catch (err) {
      const msg = readError(err)
      if (msg.toLowerCase().includes('403') || msg.toLowerCase().includes('forbidden')) {
        setLogError('ログの記録にはマネージャー以上の権限が必要です')
      } else {
        setLogError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function logField(key: keyof LogFormValues) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setLogForm((v) => ({ ...v, [key]: e.target.value }))
  }

  const hasLog = entry.log !== null

  return (
    <div className="relative pl-10">
      <div
        className={`absolute top-5 left-2.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white ${
          hasLog ? 'bg-indigo-500' : 'bg-slate-300'
        }`}
      />

      <div
        className={`rounded-xl border bg-white p-5 shadow-sm ${
          hasLog ? 'border-indigo-100' : 'border-slate-200'
        }`}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900">{formatDateTime(entry.scheduledAt)}</p>
            <p className="text-xs text-slate-500">{entry.durationMin} 分</p>
          </div>
          {!hasLog && (
            <button
              type="button"
              onClick={() => setShowLogForm((v) => !v)}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {showLogForm ? 'キャンセル' : '＋ ログを記録'}
            </button>
          )}
        </div>

        {hasLog && entry.log !== null && <LogContent log={entry.log} />}

        {!hasLog && !showLogForm && <p className="text-xs text-slate-400 italic">ログ未入力</p>}

        {showLogForm && (
          <form
            onSubmit={handleLogSubmit}
            className="mt-3 space-y-3 border-t border-slate-100 pt-3"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">議題（任意）</label>
              <input
                maxLength={500}
                value={logForm.agenda}
                onChange={logField('agenda')}
                placeholder="議題を入力"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                議事内容 <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                maxLength={5000}
                value={logForm.content}
                onChange={logField('content')}
                placeholder="1on1 の内容を記録"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ネクストアクション（任意）
              </label>
              <textarea
                rows={2}
                maxLength={2000}
                value={logForm.nextActions}
                onChange={logField('nextActions')}
                placeholder="次回までのアクション"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">公開範囲</label>
              <select
                value={logForm.visibility}
                onChange={logField('visibility')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                <option value="MANAGER_ONLY">マネージャーのみ</option>
                <option value="BOTH">本人にも公開</option>
              </select>
            </div>
            {logError && <p className="text-xs text-rose-600">{logError}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? '保存中…' : '保存する'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LogContent
// ─────────────────────────────────────────────────────────────────────────────

function LogContent({ log }: { readonly log: OneOnOneLogRecord }): ReactElement {
  return (
    <div className="space-y-2">
      {log.agenda && (
        <div>
          <p className="text-xs font-medium text-slate-500">議題</p>
          <p className="text-sm text-slate-700">{log.agenda}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-slate-500">議事内容</p>
        <p className="text-sm whitespace-pre-wrap text-slate-700">{log.content}</p>
      </div>
      {log.nextActions && (
        <div>
          <p className="text-xs font-medium text-slate-500">ネクストアクション</p>
          <p className="text-sm whitespace-pre-wrap text-slate-700">{log.nextActions}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            log.visibility === 'BOTH'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {log.visibility === 'BOTH' ? '本人にも公開' : 'マネージャーのみ'}
        </span>
        <span className="text-xs text-slate-400">記録日: {formatDate(log.recordedAt)}</span>
      </div>
    </div>
  )
}
