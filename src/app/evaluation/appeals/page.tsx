/**
 * Issue #182 / Task 20.2 / Req 18.4, 18.5: HR_MANAGER 異議申立て審査一覧・詳細画面
 *
 * - GET  /api/appeals               — 未対応申立て一覧（HR_MANAGER/ADMIN）
 * - PATCH /api/appeals/{appealId}   — 審査結果を記録
 *   body: { status, reviewComment }
 */
'use client'

import { useEffect, useState, type ReactElement, type FormEvent } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppealTargetType = 'FEEDBACK' | 'TOTAL_EVALUATION'

type AppealStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'

type ReviewDecision = Extract<AppealStatus, 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'>

interface Appeal {
  readonly id: string
  readonly appellantId: string
  readonly cycleId: string
  readonly subjectId: string
  readonly targetType: AppealTargetType
  readonly targetId: string
  readonly reason: string
  readonly desiredOutcome: string | null
  readonly status: AppealStatus
  readonly reviewerId: string | null
  readonly reviewComment: string | null
  readonly reviewedAt: string | null
  readonly submittedAt: string
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type ListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly appeals: readonly Appeal[] }

interface ReviewForm {
  status: ReviewDecision
  reviewComment: string
}

type ReviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reviewing'; readonly appealId: string }
  | { readonly kind: 'saving' }
  | { readonly kind: 'done'; readonly appealId: string }
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

const STATUS_LABELS: Record<AppealStatus, string> = {
  SUBMITTED: '提出済み',
  UNDER_REVIEW: '審査中',
  ACCEPTED: '認容',
  REJECTED: '棄却',
  WITHDRAWN: '取り下げ',
}

const STATUS_COLORS: Record<AppealStatus, string> = {
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  WITHDRAWN: 'bg-slate-50 text-slate-600 border-slate-200',
}

const TARGET_TYPE_LABELS: Record<AppealTargetType, string> = {
  FEEDBACK: '360度フィードバック',
  TOTAL_EVALUATION: '総合評価',
}

const DECISION_OPTIONS: { value: ReviewDecision; label: string }[] = [
  { value: 'UNDER_REVIEW', label: '審査中に変更' },
  { value: 'ACCEPTED', label: '認容（再計算トリガー）' },
  { value: 'REJECTED', label: '棄却' },
  { value: 'WITHDRAWN', label: '取り下げ' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { readonly status: AppealStatus }): ReactElement {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function AppealCard({
  appeal,
  isSelected,
  onSelect,
}: {
  readonly appeal: Appeal
  readonly isSelected: boolean
  readonly onSelect: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-300 ${
        isSelected ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {TARGET_TYPE_LABELS[appeal.targetType]}
            </span>
            <StatusBadge status={appeal.status} />
          </div>
          <p className="mt-1 truncate font-mono text-xs text-slate-500">{appeal.appellantId}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-700">{appeal.reason}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">提出日: {formatDate(appeal.submittedAt)}</p>
    </button>
  )
}

function AppealDetail({
  appeal,
  reviewForm,
  setReviewForm,
  reviewState,
  onReview,
  onClose,
}: {
  readonly appeal: Appeal
  readonly reviewForm: ReviewForm
  readonly setReviewForm: (fn: (f: ReviewForm) => ReviewForm) => void
  readonly reviewState: ReviewState
  readonly onReview: (e: FormEvent) => void
  readonly onClose: () => void
}): ReactElement {
  const isPending = appeal.status === 'SUBMITTED' || appeal.status === 'UNDER_REVIEW'
  const isSaving = reviewState.kind === 'saving'

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold text-slate-800">申立て詳細</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-600"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs font-medium text-slate-500">申立て ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-700">{appeal.id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">申立者 ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-700">{appeal.appellantId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">対象</dt>
            <dd className="mt-0.5 text-slate-700">
              {TARGET_TYPE_LABELS[appeal.targetType]}
              <span className="ml-1 font-mono text-xs text-slate-400">({appeal.targetId})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">ステータス</dt>
            <dd className="mt-0.5">
              <StatusBadge status={appeal.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">提出日</dt>
            <dd className="mt-0.5 text-slate-700">{formatDate(appeal.submittedAt)}</dd>
          </div>
        </dl>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">申立て理由</p>
          <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800">
            {appeal.reason}
          </p>
        </div>

        {appeal.desiredOutcome && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">希望する対応</p>
            <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm leading-relaxed text-slate-800">
              {appeal.desiredOutcome}
            </p>
          </div>
        )}

        {!isPending && appeal.reviewComment && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">審査コメント</p>
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
              {appeal.reviewComment}
            </p>
            {appeal.reviewedAt && (
              <p className="mt-1 text-xs text-slate-400">審査日: {formatDate(appeal.reviewedAt)}</p>
            )}
          </div>
        )}

        {isPending && (
          <form onSubmit={onReview} className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700">審査を記録する</p>

            <div>
              <label htmlFor="decision" className="mb-1 block text-xs font-medium text-slate-600">
                判定
              </label>
              <select
                id="decision"
                value={reviewForm.status}
                onChange={(e) =>
                  setReviewForm((f) => ({ ...f, status: e.target.value as ReviewDecision }))
                }
                disabled={isSaving}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
              >
                {DECISION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="reviewComment"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                審査コメント <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="reviewComment"
                rows={4}
                value={reviewForm.reviewComment}
                onChange={(e) => setReviewForm((f) => ({ ...f, reviewComment: e.target.value }))}
                disabled={isSaving}
                placeholder="審査結果の理由を記入してください（2000文字以内）"
                maxLength={2000}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
              />
            </div>

            {reviewState.kind === 'error' && (
              <p className="text-xs text-rose-600">{reviewState.message}</p>
            )}

            <button
              type="submit"
              disabled={isSaving || reviewForm.reviewComment.trim().length === 0}
              className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? '保存中…' : '審査結果を記録'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AppealReviewPage(): ReactElement {
  const [listState, setListState] = useState<ListState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewState, setReviewState] = useState<ReviewState>({ kind: 'idle' })
  const [reviewForm, setReviewForm] = useState<ReviewForm>({
    status: 'UNDER_REVIEW',
    reviewComment: '',
  })

  useEffect(() => {
    void (async () => {
      try {
        const appeals = await fetchJson<Appeal[]>('/api/appeals')
        setListState({ kind: 'ready', appeals: appeals ?? [] })
      } catch (err) {
        setListState({ kind: 'error', message: readError(err) })
      }
    })()
  }, [])

  function openReview(appeal: Appeal): void {
    setSelectedId(appeal.id)
    setReviewForm({ status: 'UNDER_REVIEW', reviewComment: '' })
    setReviewState({ kind: 'reviewing', appealId: appeal.id })
  }

  function closeReview(): void {
    setSelectedId(null)
    setReviewState({ kind: 'idle' })
  }

  async function handleReview(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!selectedId || reviewForm.reviewComment.trim().length === 0) return
    setReviewState({ kind: 'saving' })
    try {
      await fetchJson<Appeal>(`/api/appeals/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: reviewForm.status,
          reviewComment: reviewForm.reviewComment.trim(),
        }),
      })
      const updated = await fetchJson<Appeal[]>('/api/appeals')
      setListState({ kind: 'ready', appeals: updated ?? [] })
      setReviewState({ kind: 'done', appealId: selectedId })
      setSelectedId(null)
    } catch (err) {
      setReviewState({ kind: 'error', message: readError(err) })
    }
  }

  const selectedAppeal =
    listState.kind === 'ready' && selectedId
      ? (listState.appeals.find((a) => a.id === selectedId) ?? null)
      : null

  const pendingAppeals =
    listState.kind === 'ready'
      ? listState.appeals.filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW')
      : []

  const resolvedAppeals =
    listState.kind === 'ready'
      ? listState.appeals.filter(
          (a) => a.status === 'ACCEPTED' || a.status === 'REJECTED' || a.status === 'WITHDRAWN',
        )
      : []

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">評価</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">異議申立て審査</h1>
          <p className="mt-2 text-sm text-slate-600">
            社員からの異議申立てを審査し、認容・棄却を決定します（HR_MANAGER 専用）。
          </p>
        </div>
        <a
          href="/evaluation/cycles"
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← サイクル一覧
        </a>
      </header>

      {reviewState.kind === 'done' && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ 審査結果を記録しました
        </div>
      )}

      {listState.kind === 'loading' && (
        <div className="py-16 text-center text-sm text-slate-400">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      )}

      {listState.kind === 'error' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-semibold">申立て一覧の取得に失敗しました</p>
          <p className="mt-1 text-xs">{listState.message}</p>
        </div>
      )}

      {listState.kind === 'ready' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── 一覧パネル ── */}
          <div className="space-y-6 lg:col-span-2">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                未対応{' '}
                <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                  {pendingAppeals.length}
                </span>
              </h2>
              {pendingAppeals.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
                  未対応の申立てはありません
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingAppeals.map((appeal) => (
                    <AppealCard
                      key={appeal.id}
                      appeal={appeal}
                      isSelected={selectedId === appeal.id}
                      onSelect={() => openReview(appeal)}
                    />
                  ))}
                </div>
              )}
            </section>

            {resolvedAppeals.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-slate-500">
                  対応済み（{resolvedAppeals.length} 件）
                </h2>
                <div className="space-y-3">
                  {resolvedAppeals.map((appeal) => (
                    <AppealCard
                      key={appeal.id}
                      appeal={appeal}
                      isSelected={selectedId === appeal.id}
                      onSelect={() => setSelectedId(appeal.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── 詳細 / 審査パネル ── */}
          <div className="lg:col-span-1">
            {!selectedId ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 py-16 text-center text-sm text-slate-400">
                申立てを選択してください
              </div>
            ) : selectedAppeal ? (
              <AppealDetail
                appeal={selectedAppeal}
                reviewForm={reviewForm}
                setReviewForm={setReviewForm}
                reviewState={reviewState}
                onReview={(e) => void handleReview(e)}
                onClose={closeReview}
              />
            ) : null}
          </div>
        </div>
      )}
    </main>
  )
}
