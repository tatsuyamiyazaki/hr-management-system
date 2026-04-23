/**
 * Issue #177 / Task 13.2 / Req 6.3, 6.4, 6.5: 個人目標登録・上長承認画面
 *
 * - 全ロールアクセス可能（自分の目標）
 * - GET  /api/goals/personal              → 自分の目標一覧
 * - POST /api/goals/personal              → 目標新規作成
 * - POST /api/goals/personal/[id]/submit  → DRAFT→PENDING_APPROVAL
 * - POST /api/goals/personal/[id]/approve → PENDING_APPROVAL→APPROVED (MANAGER+)
 * - POST /api/goals/personal/[id]/reject  → PENDING_APPROVAL→REJECTED (MANAGER+)
 */
'use client'

import { useEffect, useState, type ReactElement, type FormEvent, type ChangeEvent } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type GoalType = 'OKR' | 'MBO'
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
  readonly description: string | null
  readonly goalType: GoalType
  readonly keyResult: string | null
  readonly targetValue: number | null
  readonly unit: string | null
  readonly status: GoalStatus
  readonly parentOrgGoalId: string | null
  readonly startDate: string
  readonly endDate: string
  readonly rejectedReason: string | null
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly goals: readonly PersonalGoal[] }

interface FormValues {
  title: string
  description: string
  goalType: GoalType
  keyResult: string
  targetValue: string
  unit: string
  parentOrgGoalId: string
  startDate: string
  endDate: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAL_URL = '/api/goals/personal'

const STATUS_LABELS: Record<GoalStatus, string> = {
  DRAFT: '下書き',
  PENDING_APPROVAL: '承認待ち',
  APPROVED: '承認済',
  REJECTED: '差戻し',
  IN_PROGRESS: '進行中',
  COMPLETED: '完了',
}

const STATUS_COLORS: Record<GoalStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-indigo-100 text-indigo-700',
}

const EMPTY_FORM: FormValues = {
  title: '',
  description: '',
  goalType: 'OKR',
  keyResult: '',
  targetValue: '',
  unit: '',
  parentOrgGoalId: '',
  startDate: '',
  endDate: '',
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

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function PersonalGoalPage(): ReactElement {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function loadGoals(): Promise<void> {
    setState({ kind: 'loading' })
    try {
      const goals = await fetchJson<PersonalGoal[]>(PERSONAL_URL)
      setState({ kind: 'ready', goals: Array.isArray(goals) ? goals : [] })
    } catch (err) {
      setState({ kind: 'error', message: readError(err) })
    }
  }

  useEffect(() => {
    void loadGoals()
  }, [])

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    setActionError(null)
    try {
      await fetchJson(PERSONAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          goalType: form.goalType,
          keyResult: form.keyResult || undefined,
          targetValue: form.targetValue ? Number(form.targetValue) : undefined,
          unit: form.unit || undefined,
          parentOrgGoalId: form.parentOrgGoalId || undefined,
          startDate: form.startDate,
          endDate: form.endDate,
        }),
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      await loadGoals()
    } catch (err) {
      setActionError(readError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAction(
    goalId: string,
    action: 'submit' | 'approve' | 'reject',
  ): Promise<void> {
    setActionError(null)
    try {
      await fetchJson(`${PERSONAL_URL}/${goalId}/${action}`, { method: 'POST' })
      await loadGoals()
    } catch (err) {
      setActionError(readError(err))
    }
  }

  const goals = state.kind === 'ready' ? state.goals : []
  const inProgressCount = goals.filter((g) => g.status === 'IN_PROGRESS').length
  const pendingCount = goals.filter((g) => g.status === 'PENDING_APPROVAL').length
  const approvedCount = goals.filter(
    (g) => g.status === 'APPROVED' || g.status === 'IN_PROGRESS' || g.status === 'COMPLETED',
  ).length

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">Goals</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">個人目標</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            目標の登録・申請・承認を行います。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          {showForm ? 'キャンセル' : '＋ 目標を追加'}
        </button>
      </header>

      {/* KPI Summary */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">目標数</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{goals.length}</p>
          <p className="mt-1 text-xs text-slate-500">登録済みの目標合計</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-indigo-500 uppercase">進行中</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-indigo-700">{inProgressCount}</p>
          <p className="mt-1 text-xs text-indigo-500">承認済み {approvedCount}件</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-amber-600 uppercase">承認待ち</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-amber-700">{pendingCount}</p>
          <p className="mt-1 text-xs text-amber-600">上長承認を待っている目標</p>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          {actionError}
        </div>
      )}

      {showForm && (
        <GoalForm form={form} onChange={setForm} onSubmit={handleCreate} submitting={submitting} />
      )}

      <GoalList state={state} onAction={handleAction} />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GoalForm
// ─────────────────────────────────────────────────────────────────────────────

function GoalForm({
  form,
  onChange,
  onSubmit,
  submitting,
}: {
  readonly form: FormValues
  readonly onChange: (v: FormValues) => void
  readonly onSubmit: (e: FormEvent) => void
  readonly submitting: boolean
}): ReactElement {
  function field(key: keyof FormValues) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...form, [key]: e.target.value })
  }

  return (
    <form onSubmit={onSubmit} className="mb-8 rounded-xl border border-indigo-200 bg-indigo-50 p-6">
      <h2 className="mb-4 font-semibold text-slate-800">新規目標登録</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            タイトル <span className="text-rose-500">*</span>
          </label>
          <input
            required
            maxLength={200}
            value={form.title}
            onChange={field('title')}
            placeholder="目標タイトルを入力"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">説明</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={field('description')}
            placeholder="目標の詳細・背景"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">目標タイプ</label>
          <select
            value={form.goalType}
            onChange={field('goalType')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          >
            <option value="OKR">OKR</option>
            <option value="MBO">MBO</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {form.goalType === 'OKR' ? 'Key Result' : '目標値'}
          </label>
          {form.goalType === 'OKR' ? (
            <input
              value={form.keyResult}
              onChange={field('keyResult')}
              placeholder="成功指標を入力"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={form.targetValue}
                onChange={field('targetValue')}
                placeholder="数値"
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
              <input
                value={form.unit}
                onChange={field('unit')}
                placeholder="単位"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
          )}
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
            関連組織目標 ID（任意）
          </label>
          <input
            value={form.parentOrgGoalId}
            onChange={field('parentOrgGoalId')}
            placeholder="組織目標IDを貼り付け"
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
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GoalList
// ─────────────────────────────────────────────────────────────────────────────

function GoalList({
  state,
  onAction,
}: {
  readonly state: PageState
  readonly onAction: (goalId: string, action: 'submit' | 'approve' | 'reject') => void
}): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">データを読み込み中…</span>
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
  if (state.goals.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        目標が登録されていません
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {state.goals.map((g) => (
        <GoalCard key={g.id} goal={g} onAction={onAction} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GoalCard
// ─────────────────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onAction,
}: {
  readonly goal: PersonalGoal
  readonly onAction: (goalId: string, action: 'submit' | 'approve' | 'reject') => void
}): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[goal.status]}`}
            >
              {STATUS_LABELS[goal.status]}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                goal.goalType === 'OKR'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {goal.goalType}
            </span>
          </div>

          <p className="mt-1 font-semibold text-slate-900">{goal.title}</p>

          {goal.description && <p className="mt-0.5 text-xs text-slate-500">{goal.description}</p>}

          {goal.keyResult && (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium">KR:</span> {goal.keyResult}
            </p>
          )}

          {goal.targetValue !== null && (
            <p className="mt-0.5 text-xs text-slate-500">
              目標値: {goal.targetValue} {goal.unit ?? ''}
            </p>
          )}

          {goal.rejectedReason && (
            <p className="mt-1 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">
              差戻し理由: {goal.rejectedReason}
            </p>
          )}

          <p className="mt-1 text-xs text-slate-400">
            {goal.startDate.slice(0, 10)} 〜 {goal.endDate.slice(0, 10)}
          </p>
        </div>

        <ActionButtons goal={goal} onAction={onAction} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionButtons
// ─────────────────────────────────────────────────────────────────────────────

function ActionButtons({
  goal,
  onAction,
}: {
  readonly goal: PersonalGoal
  readonly onAction: (goalId: string, action: 'submit' | 'approve' | 'reject') => void
}): ReactElement | null {
  if (goal.status === 'DRAFT') {
    return (
      <button
        type="button"
        onClick={() => onAction(goal.id, 'submit')}
        className="shrink-0 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
      >
        承認申請
      </button>
    )
  }

  if (goal.status === 'PENDING_APPROVAL') {
    return (
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onAction(goal.id, 'approve')}
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          承認
        </button>
        <button
          type="button"
          onClick={() => onAction(goal.id, 'reject')}
          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
        >
          差戻し
        </button>
      </div>
    )
  }

  return null
}
