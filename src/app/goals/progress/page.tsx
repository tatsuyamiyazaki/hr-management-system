/**
 * Issue #177 / Task 13.3 / Req 6.6, 6.7: 進捗更新・部下目標一覧画面
 *
 * - 全ロールアクセス可能（自分の進捗更新）
 * - GET  /api/goals/personal                   → 自分の目標一覧（APPROVED/IN_PROGRESS）
 * - POST /api/goals/personal/[id]/progress     → 進捗記録（progressRate + comment）
 * - GET  /api/goals/subordinates               → 部下の目標一覧（MANAGER+、403は非表示）
 */
'use client'

import { useEffect, useState, type ReactElement, type FormEvent, type ChangeEvent } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type GoalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'

interface PersonalGoal {
  readonly id: string
  readonly title: string
  readonly status: GoalStatus
  readonly goalType: 'OKR' | 'MBO'
  readonly startDate: string
  readonly endDate: string
}

interface GoalProgressRecord {
  readonly id: string
  readonly goalId: string
  readonly progressRate: number
  readonly comment: string | null
  readonly recordedBy: string
  readonly recordedAt: string
}

interface SubordinateGoalSummary {
  readonly userId: string
  readonly goalId: string
  readonly title: string
  readonly status: string
  readonly currentProgressRate: number
  readonly endDate: string
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type GoalsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly goals: readonly PersonalGoal[] }

type SubordinatesState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'hidden' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly items: readonly SubordinateGoalSummary[] }

interface ProgressFormValues {
  progressRate: string
  comment: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAL_URL = '/api/goals/personal'
const SUBORDINATES_URL = '/api/goals/subordinates'

const STATUS_LABELS: Record<GoalStatus, string> = {
  DRAFT: '下書き',
  PENDING_APPROVAL: '承認待ち',
  APPROVED: '承認済',
  REJECTED: '差戻し',
  IN_PROGRESS: '進行中',
  COMPLETED: '完了',
}

const ACTIVE_STATUSES: readonly GoalStatus[] = ['APPROVED', 'IN_PROGRESS']

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
    return msg.includes('403') || msg.includes('forbidden') || msg.includes('権限')
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function GoalProgressPage(): ReactElement {
  const [goalsState, setGoalsState] = useState<GoalsState>({ kind: 'loading' })
  const [subState, setSubState] = useState<SubordinatesState>({ kind: 'loading' })

  useEffect(() => {
    void (async () => {
      try {
        const goals = await fetchJson<PersonalGoal[]>(PERSONAL_URL)
        const filtered = Array.isArray(goals)
          ? goals.filter((g) => ACTIVE_STATUSES.includes(g.status))
          : []
        setGoalsState({ kind: 'ready', goals: filtered })
      } catch (err) {
        setGoalsState({ kind: 'error', message: readError(err) })
      }
    })()

    void (async () => {
      try {
        const items = await fetchJson<SubordinateGoalSummary[]>(SUBORDINATES_URL)
        setSubState({ kind: 'ready', items: Array.isArray(items) ? items : [] })
      } catch (err) {
        if (isForbidden(err)) {
          setSubState({ kind: 'hidden' })
        } else {
          setSubState({ kind: 'error', message: readError(err) })
        }
      }
    })()
  }, [])

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Goals</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">進捗管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          承認済み目標の進捗を記録し、部下の状況を確認できます。
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">自分の目標進捗</h2>
        <MyGoalsSection state={goalsState} />
      </section>

      {subState.kind !== 'hidden' && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-800">部下の目標一覧</h2>
          <SubordinatesSection state={subState} />
        </section>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MyGoalsSection
// ─────────────────────────────────────────────────────────────────────────────

function MyGoalsSection({ state }: { readonly state: GoalsState }): ReactElement {
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
  if (state.goals.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
        進捗を記録できる目標がありません（承認済 / 進行中の目標が対象です）
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {state.goals.map((g) => (
        <GoalProgressCard key={g.id} goal={g} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GoalProgressCard
// ─────────────────────────────────────────────────────────────────────────────

function GoalProgressCard({ goal }: { readonly goal: PersonalGoal }): ReactElement {
  const [form, setForm] = useState<ProgressFormValues>({ progressRate: '', comment: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<readonly GoalProgressRecord[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.progressRate) return
    setSubmitting(true)
    setError(null)
    try {
      await fetchJson(`${PERSONAL_URL}/${goal.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progressRate: Number(form.progressRate),
          comment: form.comment || undefined,
        }),
      })
      setForm({ progressRate: '', comment: '' })
      if (showHistory) {
        await loadHistory()
      }
    } catch (err) {
      setError(readError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function loadHistory(): Promise<void> {
    setLoadingHistory(true)
    try {
      const records = await fetchJson<GoalProgressRecord[]>(`${PERSONAL_URL}/${goal.id}/progress`)
      setHistory(Array.isArray(records) ? records : [])
    } catch (err) {
      setError(readError(err))
    } finally {
      setLoadingHistory(false)
    }
  }

  async function toggleHistory(): Promise<void> {
    const next = !showHistory
    setShowHistory(next)
    if (next && history === null) {
      await loadHistory()
    }
  }

  const rate = Number(form.progressRate)
  const validRate = form.progressRate !== '' && rate >= 0 && rate <= 100

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{goal.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            <span
              className={`mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                goal.goalType === 'OKR'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {goal.goalType}
            </span>
            {STATUS_LABELS[goal.status]} · {goal.startDate.slice(0, 10)} 〜{' '}
            {goal.endDate.slice(0, 10)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleHistory()}
          className="text-xs text-indigo-600 hover:underline"
        >
          {showHistory ? '履歴を隠す' : '履歴を見る'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">進捗率 (0–100)</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              value={form.progressRate}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setForm((v) => ({ ...v, progressRate: e.target.value }))
              }
              placeholder="75"
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </div>

        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600">コメント（任意）</label>
          <input
            maxLength={1000}
            value={form.comment}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm((v) => ({ ...v, comment: e.target.value }))
            }
            placeholder="進捗メモを入力"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !validRate}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {submitting ? '記録中…' : '記録'}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {showHistory && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {loadingHistory ? (
            <p className="animate-pulse text-xs text-slate-400">履歴を読み込み中…</p>
          ) : history === null || history.length === 0 ? (
            <p className="text-xs text-slate-400">記録がありません</p>
          ) : (
            <ul className="space-y-2">
              {history.map((r) => (
                <li key={r.id} className="flex items-start gap-3 text-xs text-slate-600">
                  <span className="shrink-0 font-semibold text-indigo-600">{r.progressRate}%</span>
                  <span className="flex-1">{r.comment ?? '—'}</span>
                  <span className="shrink-0 text-slate-400">{r.recordedAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SubordinatesSection
// ─────────────────────────────────────────────────────────────────────────────

function SubordinatesSection({ state }: { readonly state: SubordinatesState }): ReactElement {
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
  // state.kind === 'ready' at this point (loading/error/hidden already returned above)
  if (state.kind !== 'ready' || state.items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
        部下の目標データがありません
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">目標タイトル</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">ステータス</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">進捗率</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">期限</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.items.map((item) => (
            <SubordinateRow key={item.goalId} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SubordinateRow
// ─────────────────────────────────────────────────────────────────────────────

function SubordinateRow({ item }: { readonly item: SubordinateGoalSummary }): ReactElement {
  const pct = Math.min(100, Math.max(0, item.currentProgressRate))

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-medium text-slate-800">{item.title}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {item.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-600 tabular-nums">{pct}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {typeof item.endDate === 'string'
          ? item.endDate.slice(0, 10)
          : new Date(item.endDate).toISOString().slice(0, 10)}
      </td>
    </tr>
  )
}
