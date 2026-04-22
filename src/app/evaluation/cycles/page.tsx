/**
 * Issue #179 / Task 15.2 / Req 8.1, 8.2: 360度評価サイクル管理画面
 *
 * - GET  /api/evaluation/cycles — サイクル一覧
 * - POST /api/evaluation/cycles — サイクル作成（HR_MANAGER/ADMIN）
 * - POST /api/evaluation/cycles/[id]/activate — DRAFT → ACTIVE
 * - POST /api/evaluation/cycles/[id]/close    — FINALIZED → CLOSED
 */
'use client'

import { useEffect, useState, type ReactElement, type FormEvent, type ChangeEvent } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ReviewCycleStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'AGGREGATING'
  | 'PENDING_FEEDBACK_APPROVAL'
  | 'FINALIZED'
  | 'CLOSED'

interface ReviewCycleRecord {
  readonly id: string
  readonly name: string
  readonly status: ReviewCycleStatus
  readonly startDate: string
  readonly endDate: string
  readonly items: readonly string[]
  readonly incentiveK: number
  readonly minReviewers: number
  readonly maxTargets: number
  readonly createdBy: string
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
  | { readonly kind: 'ready'; readonly cycles: readonly ReviewCycleRecord[] }

interface FormValues {
  name: string
  startDate: string
  endDate: string
  items: string
  incentiveK: string
  minReviewers: string
  maxTargets: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CYCLES_URL = '/api/evaluation/cycles'

const EMPTY_FORM: FormValues = {
  name: '',
  startDate: '',
  endDate: '',
  items: '',
  incentiveK: '1',
  minReviewers: '3',
  maxTargets: '10',
}

const STATUS_LABELS: Record<ReviewCycleStatus, string> = {
  DRAFT: '下書き',
  ACTIVE: '実施中',
  AGGREGATING: '集計中',
  PENDING_FEEDBACK_APPROVAL: 'FB承認待ち',
  FINALIZED: '完了',
  CLOSED: 'クローズ',
}

const STATUS_COLORS: Record<ReviewCycleStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  ACTIVE: 'bg-indigo-100 text-indigo-700',
  AGGREGATING: 'bg-amber-100 text-amber-700',
  PENDING_FEEDBACK_APPROVAL: 'bg-purple-100 text-purple-700',
  FINALIZED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-slate-100 text-slate-500',
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

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EvaluationCyclesPage(): ReactElement {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [transitionId, setTransitionId] = useState<string | null>(null)

  async function loadCycles(): Promise<void> {
    setState({ kind: 'loading' })
    try {
      const cycles = await fetchJson<ReviewCycleRecord[]>(CYCLES_URL)
      setState({ kind: 'ready', cycles: Array.isArray(cycles) ? cycles : [] })
    } catch (err) {
      setState({ kind: 'error', message: readError(err) })
    }
  }

  useEffect(() => {
    void loadCycles()
  }, [])

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    setActionError(null)
    try {
      const itemsArray = form.items
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      await fetchJson(CYCLES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          startDate: form.startDate,
          endDate: form.endDate,
          items: itemsArray,
          incentiveK: Number(form.incentiveK),
          minReviewers: Number(form.minReviewers),
          maxTargets: Number(form.maxTargets),
        }),
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      await loadCycles()
    } catch (err) {
      const msg = readError(err)
      setActionError(
        msg.toLowerCase().includes('403') || msg.toLowerCase().includes('forbidden')
          ? 'サイクル作成には HR_MANAGER/ADMIN 権限が必要です'
          : msg,
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTransition(cycleId: string, action: 'activate' | 'close'): Promise<void> {
    setTransitionId(cycleId)
    setActionError(null)
    try {
      await fetchJson(`${CYCLES_URL}/${cycleId}/${action}`, { method: 'POST' })
      await loadCycles()
    } catch (err) {
      setActionError(readError(err))
    } finally {
      setTransitionId(null)
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
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            360度評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">評価サイクル管理</h1>
          <p className="mt-2 text-sm text-slate-600">
            評価サイクルの作成・状態管理を行います。HR_MANAGER/ADMIN のみ作成・状態変更可能です。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showForm ? 'キャンセル' : '＋ サイクルを作成'}
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
          <h2 className="mb-4 font-semibold text-slate-800">評価サイクルを登録</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                サイクル名 <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.name}
                onChange={field('name')}
                placeholder="例: 2024年度上期 360度評価"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                開始日 <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="date"
                value={form.startDate}
                onChange={field('startDate')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                終了日 <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="date"
                value={form.endDate}
                onChange={field('endDate')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                評価項目（1行1項目）<span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                value={form.items}
                onChange={field('items')}
                placeholder={'価値観体現\n経営貢献\nチームワーク'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                インセンティブ係数 k <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={form.incentiveK}
                onChange={field('incentiveK')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                最低評価者数 <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="number"
                min="1"
                max="50"
                value={form.minReviewers}
                onChange={field('minReviewers')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                最大対象者数 <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="number"
                min="1"
                max="1000"
                value={form.maxTargets}
                onChange={field('maxTargets')}
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
              {submitting ? '作成中…' : '作成する'}
            </button>
          </div>
        </form>
      )}

      <CycleList
        state={state}
        transitionId={transitionId}
        onActivate={(id) => void handleTransition(id, 'activate')}
        onClose={(id) => void handleTransition(id, 'close')}
      />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CycleList
// ─────────────────────────────────────────────────────────────────────────────

function CycleList({
  state,
  transitionId,
  onActivate,
  onClose,
}: {
  readonly state: PageState
  readonly transitionId: string | null
  readonly onActivate: (id: string) => void
  readonly onClose: (id: string) => void
}): ReactElement {
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
  if (state.cycles.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        評価サイクルがありません
      </div>
    )
  }

  const sorted = [...state.cycles].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <div className="space-y-4">
      {sorted.map((cycle) => (
        <CycleCard
          key={cycle.id}
          cycle={cycle}
          isTransitioning={transitionId === cycle.id}
          onActivate={onActivate}
          onClose={onClose}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CycleCard
// ─────────────────────────────────────────────────────────────────────────────

function CycleCard({
  cycle,
  isTransitioning,
  onActivate,
  onClose,
}: {
  readonly cycle: ReviewCycleRecord
  readonly isTransitioning: boolean
  readonly onActivate: (id: string) => void
  readonly onClose: (id: string) => void
}): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[cycle.status]}`}
            >
              {STATUS_LABELS[cycle.status]}
            </span>
          </div>
          <p className="mt-1 font-semibold text-slate-900">{cycle.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(cycle.startDate)} 〜 {formatDate(cycle.endDate)}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>最低評価者: {cycle.minReviewers}名</span>
            <span>最大対象者: {cycle.maxTargets}名</span>
            <span>係数 k: {cycle.incentiveK}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {cycle.items.map((item) => (
              <span
                key={item}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {cycle.status === 'DRAFT' && (
            <button
              type="button"
              disabled={isTransitioning}
              onClick={() => onActivate(cycle.id)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isTransitioning ? '処理中…' : '開始する'}
            </button>
          )}
          {cycle.status === 'FINALIZED' && (
            <button
              type="button"
              disabled={isTransitioning}
              onClick={() => onClose(cycle.id)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isTransitioning ? '処理中…' : 'クローズ'}
            </button>
          )}
          <a
            href={`/evaluation/assignments?cycleId=${cycle.id}`}
            className="rounded-md border border-indigo-200 px-3 py-1.5 text-center text-xs font-medium text-indigo-600 hover:bg-indigo-50"
          >
            割り当て管理 →
          </a>
          {(cycle.status === 'ACTIVE' ||
            cycle.status === 'AGGREGATING' ||
            cycle.status === 'FINALIZED') && (
            <a
              href={`/evaluation/progress?cycleId=${cycle.id}`}
              className="rounded-md border border-emerald-200 px-3 py-1.5 text-center text-xs font-medium text-emerald-600 hover:bg-emerald-50"
            >
              進捗確認 →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
