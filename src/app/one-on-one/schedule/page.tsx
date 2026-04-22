/**
 * Issue #178 / Task 14.1 / Req 7.1, 7.2: 1on1 予定登録画面
 *
 * - 全ロールアクセス可能（一覧閲覧）
 * - MANAGER 以上のみ予定登録可能
 * - GET  /api/one-on-one/sessions — 自分のセッション一覧
 * - POST /api/one-on-one/sessions — セッション作成（MANAGER+）
 */
'use client'

import { useEffect, useState, type ReactElement, type FormEvent, type ChangeEvent } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OneOnOneSession {
  readonly id: string
  readonly managerId: string
  readonly employeeId: string
  readonly scheduledAt: string
  readonly durationMin: number
  readonly agenda: string | null
  readonly createdAt: string
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly sessions: readonly OneOnOneSession[] }

interface FormValues {
  employeeId: string
  scheduledAt: string
  durationMin: string
  agenda: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SESSIONS_URL = '/api/one-on-one/sessions'

const EMPTY_FORM: FormValues = {
  employeeId: '',
  scheduledAt: '',
  durationMin: '30',
  agenda: '',
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

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function OneOnOneSchedulePage(): ReactElement {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function loadSessions(): Promise<void> {
    setState({ kind: 'loading' })
    try {
      const sessions = await fetchJson<OneOnOneSession[]>(SESSIONS_URL)
      setState({ kind: 'ready', sessions: Array.isArray(sessions) ? sessions : [] })
    } catch (err) {
      setState({ kind: 'error', message: readError(err) })
    }
  }

  useEffect(() => {
    void loadSessions()
  }, [])

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    setActionError(null)
    try {
      await fetchJson(SESSIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: form.employeeId,
          scheduledAt: form.scheduledAt,
          durationMin: Number(form.durationMin),
          agenda: form.agenda || undefined,
        }),
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      await loadSessions()
    } catch (err) {
      const msg = readError(err)
      if (msg.toLowerCase().includes('403') || msg.toLowerCase().includes('forbidden')) {
        setActionError('予定の登録にはマネージャー以上の権限が必要です')
      } else {
        setActionError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function field(key: keyof FormValues) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((v) => ({ ...v, [key]: e.target.value }))
  }

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">1on1</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">1on1 予定</h1>
          <p className="mt-2 text-sm text-slate-600">1on1 セッションの予定を登録・確認します。</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showForm ? 'キャンセル' : '＋ 予定を追加'}
        </button>
      </header>

      {actionError && (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {actionError}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 rounded-xl border border-indigo-200 bg-indigo-50 p-6"
        >
          <h2 className="mb-4 font-semibold text-slate-800">1on1 予定を登録</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                対象社員 ID <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.employeeId}
                onChange={field('employeeId')}
                placeholder="社員 ID を入力"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                予定日時 <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="datetime-local"
                value={form.scheduledAt}
                onChange={field('scheduledAt')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                所要時間（分）<span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="number"
                min={15}
                max={240}
                value={form.durationMin}
                onChange={field('durationMin')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                アジェンダ（任意）
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                value={form.agenda}
                onChange={field('agenda')}
                placeholder="話し合いたいテーマ・議題"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? '登録中…' : '登録する'}
            </button>
          </div>
        </form>
      )}

      <SessionList state={state} />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionList
// ─────────────────────────────────────────────────────────────────────────────

function SessionList({ state }: { readonly state: PageState }): ReactElement {
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
  if (state.sessions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        1on1 予定が登録されていません
      </div>
    )
  }

  const sorted = [...state.sessions].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  )

  return (
    <div className="space-y-3">
      {sorted.map((s) => (
        <SessionCard key={s.id} session={s} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionCard
// ─────────────────────────────────────────────────────────────────────────────

function SessionCard({ session }: { readonly session: OneOnOneSession }): ReactElement {
  const isPast = new Date(session.scheduledAt) < new Date()

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                isPast ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {isPast ? '実施済み' : '予定'}
            </span>
            <span className="text-xs text-slate-500">{session.durationMin} 分</span>
          </div>

          <p className="mt-1 font-semibold text-slate-900">{formatDateTime(session.scheduledAt)}</p>

          <p className="mt-0.5 text-xs text-slate-500">
            マネージャー: {session.managerId} / 部下: {session.employeeId}
          </p>

          {session.agenda && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-medium">アジェンダ:</span> {session.agenda}
            </p>
          )}
        </div>

        <a
          href={`/one-on-one/timeline?employeeId=${session.employeeId}&managerId=${session.managerId}`}
          className="shrink-0 rounded-md border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
        >
          ログを見る →
        </a>
      </div>
    </div>
  )
}
