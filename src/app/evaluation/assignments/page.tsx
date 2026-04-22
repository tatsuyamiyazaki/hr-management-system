/**
 * Issue #179 / Task 15.3 / Req 8.3, 8.4, 8.10, 8.11, 8.12: 評価割り当て管理画面
 *
 * - cycleId をクエリパラメータで受け取る
 * - GET  /api/evaluation/assignments?cycleId=...   — 全割り当て（HR_MANAGER/ADMIN）
 * - POST /api/evaluation/assignments               — 割り当て追加（HR_MANAGER/ADMIN）
 * - POST /api/evaluation/assignments/[id]/decline  — 辞退（本人）
 */
'use client'

import { useEffect, useState, type ReactElement, type FormEvent, type ChangeEvent } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AssignmentStatus = 'ACTIVE' | 'DECLINED' | 'REPLACED'

interface ReviewDeclineRecord {
  readonly id: string
  readonly assignmentId: string
  readonly reason: string
  readonly replacementEvaluatorId: string | null
  readonly declinedAt: string
}

interface ReviewAssignmentRecord {
  readonly id: string
  readonly cycleId: string
  readonly evaluatorId: string
  readonly targetUserId: string
  readonly status: AssignmentStatus
  readonly createdAt: string
  readonly decline?: ReviewDeclineRecord
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type AssignmentState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly assignments: readonly ReviewAssignmentRecord[] }

interface AddFormValues {
  evaluatorId: string
  targetUserId: string
}

interface DeclineFormValues {
  reason: string
  replacementEvaluatorId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ASSIGNMENTS_URL = '/api/evaluation/assignments'

const EMPTY_ADD_FORM: AddFormValues = { evaluatorId: '', targetUserId: '' }

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  ACTIVE: '有効',
  DECLINED: '辞退',
  REPLACED: '代替済み',
}

const STATUS_COLORS: Record<AssignmentStatus, string> = {
  ACTIVE: 'bg-indigo-100 text-indigo-700',
  DECLINED: 'bg-rose-100 text-rose-700',
  REPLACED: 'bg-slate-100 text-slate-500',
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

export default function AssignmentsPage(): ReactElement {
  const searchParams = useSearchParams()
  const cycleId = searchParams.get('cycleId') ?? ''

  const [state, setState] = useState<AssignmentState>(
    cycleId ? { kind: 'loading' } : { kind: 'idle' },
  )
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<AddFormValues>(EMPTY_ADD_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Decline modal state
  const [declineTargetId, setDeclineTargetId] = useState<string | null>(null)
  const [declineForm, setDeclineForm] = useState<DeclineFormValues>({
    reason: '',
    replacementEvaluatorId: '',
  })
  const [declining, setDeclining] = useState(false)

  async function loadAssignments(): Promise<void> {
    if (!cycleId) return
    setState({ kind: 'loading' })
    try {
      const assignments = await fetchJson<ReviewAssignmentRecord[]>(
        `${ASSIGNMENTS_URL}?cycleId=${encodeURIComponent(cycleId)}`,
      )
      setState({ kind: 'ready', assignments: Array.isArray(assignments) ? assignments : [] })
    } catch (err) {
      setState({ kind: 'error', message: readError(err) })
    }
  }

  useEffect(() => {
    if (cycleId) void loadAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId])

  async function handleAdd(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    setActionError(null)
    try {
      await fetchJson(ASSIGNMENTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId,
          evaluatorId: addForm.evaluatorId,
          targetUserId: addForm.targetUserId,
        }),
      })
      setAddForm(EMPTY_ADD_FORM)
      setShowAddForm(false)
      await loadAssignments()
    } catch (err) {
      const msg = readError(err)
      setActionError(
        msg.toLowerCase().includes('403') || msg.toLowerCase().includes('forbidden')
          ? '割り当て追加には HR_MANAGER/ADMIN 権限が必要です'
          : msg,
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDecline(assignmentId: string): Promise<void> {
    setDeclining(true)
    setActionError(null)
    try {
      await fetchJson(`${ASSIGNMENTS_URL}/${assignmentId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: declineForm.reason,
          replacementEvaluatorId: declineForm.replacementEvaluatorId || undefined,
        }),
      })
      setDeclineTargetId(null)
      setDeclineForm({ reason: '', replacementEvaluatorId: '' })
      await loadAssignments()
    } catch (err) {
      setActionError(readError(err))
    } finally {
      setDeclining(false)
    }
  }

  function addField(key: keyof AddFormValues) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setAddForm((v) => ({ ...v, [key]: e.target.value }))
  }

  function declineField(key: keyof DeclineFormValues) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDeclineForm((v) => ({ ...v, [key]: e.target.value }))
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            360度評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">評価割り当て管理</h1>
          <p className="mt-2 text-sm text-slate-600">
            評価者・対象者の割り当て追加と辞退処理を行います。
          </p>
          {cycleId && (
            <p className="mt-1 text-xs text-slate-500">
              サイクル ID: <span className="font-mono">{cycleId}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href="/evaluation/cycles"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← サイクル一覧
          </a>
          {cycleId && (
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {showAddForm ? 'キャンセル' : '＋ 割り当て追加'}
            </button>
          )}
        </div>
      </header>

      {!cycleId && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          URL に <span className="font-mono">?cycleId=...</span> を付けてアクセスしてください
        </div>
      )}

      {cycleId && actionError && (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {actionError}
        </div>
      )}

      {cycleId && showAddForm && (
        <form
          onSubmit={handleAdd}
          className="mb-8 rounded-xl border border-indigo-200 bg-indigo-50 p-6"
        >
          <h2 className="mb-4 font-semibold text-slate-800">割り当てを追加</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                評価者 ID <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={addForm.evaluatorId}
                onChange={addField('evaluatorId')}
                placeholder="評価者の社員 ID"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                対象者 ID <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={addForm.targetUserId}
                onChange={addField('targetUserId')}
                placeholder="被評価者の社員 ID"
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
              {submitting ? '追加中…' : '追加する'}
            </button>
          </div>
        </form>
      )}

      {cycleId && <AssignmentList state={state} onDecline={setDeclineTargetId} />}

      {/* Decline Modal */}
      {declineTargetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-slate-900">評価を辞退する</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  辞退理由 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={declineForm.reason}
                  onChange={declineField('reason')}
                  placeholder="辞退理由を入力してください"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  代替評価者 ID（任意）
                </label>
                <input
                  value={declineForm.replacementEvaluatorId}
                  onChange={declineField('replacementEvaluatorId')}
                  placeholder="代替の評価者 ID（任意）"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>
            {actionError && <p className="mt-2 text-xs text-rose-600">{actionError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeclineTargetId(null)
                  setDeclineForm({ reason: '', replacementEvaluatorId: '' })
                  setActionError(null)
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={declining || !declineForm.reason}
                onClick={() => void handleDecline(declineTargetId)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {declining ? '処理中…' : '辞退する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AssignmentList
// ─────────────────────────────────────────────────────────────────────────────

function AssignmentList({
  state,
  onDecline,
}: {
  readonly state: AssignmentState
  readonly onDecline: (id: string) => void
}): ReactElement {
  if (state.kind === 'idle') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        サイクル ID を指定してください
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
  if (state.assignments.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        割り当てがありません
      </div>
    )
  }

  const sorted = [...state.assignments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">評価者 ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">対象者 ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">ステータス</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">作成日</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-700">{a.evaluatorId}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-700">{a.targetUserId}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status]}`}
                >
                  {STATUS_LABELS[a.status]}
                </span>
                {a.decline && (
                  <p className="mt-0.5 text-xs text-slate-400">理由: {a.decline.reason}</p>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{formatDate(a.createdAt)}</td>
              <td className="px-4 py-3">
                {a.status === 'ACTIVE' && (
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/evaluation/form?cycleId=${a.cycleId}&targetUserId=${a.targetUserId}`}
                      className="rounded-md border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      評価する →
                    </a>
                    <button
                      type="button"
                      onClick={() => onDecline(a.id)}
                      className="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      辞退
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
