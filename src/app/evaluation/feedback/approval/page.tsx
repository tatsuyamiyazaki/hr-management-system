/**
 * Issue #180 / Task 17.3 / Req 10.4, 10.6: HR_MANAGER フィードバック承認・公開画面
 *
 * - GET  /api/feedback/preview?cycleId=X&subjectId=Y — 変換後プレビュー取得（HR_MANAGER/ADMIN）
 * - POST /api/feedback/approve                       — 承認・公開（HR_MANAGER/ADMIN）
 */
'use client'

import { useState, type ReactElement, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FeedbackPreview {
  readonly cycleId: string
  readonly subjectId: string
  readonly transformedBatch: readonly string[]
  readonly summary: string
  readonly status: string
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type PreviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly preview: FeedbackPreview }

type ApproveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'approving' }
  | { readonly kind: 'done' }
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

const STATUS_LABELS: Record<string, string> = {
  TRANSFORMING: '変換中',
  PENDING_HR_APPROVAL: 'HR承認待ち',
  APPROVED: '承認済み',
  PUBLISHED: '公開済み',
  ARCHIVED: 'アーカイブ済み',
}

const STATUS_COLORS: Record<string, string> = {
  TRANSFORMING: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_HR_APPROVAL: 'bg-blue-50 text-blue-700 border-blue-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUBLISHED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  ARCHIVED: 'bg-slate-50 text-slate-600 border-slate-200',
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function FeedbackApprovalPage(): ReactElement {
  const searchParams = useSearchParams()
  const defaultCycleId = searchParams.get('cycleId') ?? ''
  const defaultSubjectId = searchParams.get('subjectId') ?? ''

  const [cycleId, setCycleId] = useState(defaultCycleId)
  const [subjectId, setSubjectId] = useState(defaultSubjectId)
  const [previewState, setPreviewState] = useState<PreviewState>({ kind: 'idle' })
  const [approveState, setApproveState] = useState<ApproveState>({ kind: 'idle' })

  async function handlePreview(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!cycleId.trim() || !subjectId.trim()) return

    setPreviewState({ kind: 'loading' })
    setApproveState({ kind: 'idle' })
    try {
      const preview = await fetchJson<FeedbackPreview>(
        `/api/feedback/preview?cycleId=${encodeURIComponent(cycleId.trim())}&subjectId=${encodeURIComponent(subjectId.trim())}`,
      )
      setPreviewState({ kind: 'ready', preview })
    } catch (err) {
      setPreviewState({ kind: 'error', message: readError(err) })
    }
  }

  async function handleApprove(): Promise<void> {
    if (previewState.kind !== 'ready') return
    setApproveState({ kind: 'approving' })
    try {
      await fetchJson<null>('/api/feedback/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId: previewState.preview.cycleId,
          subjectId: previewState.preview.subjectId,
        }),
      })
      setApproveState({ kind: 'done' })
      setPreviewState({
        kind: 'ready',
        preview: { ...previewState.preview, status: 'PUBLISHED' },
      })
    } catch (err) {
      setApproveState({ kind: 'error', message: readError(err) })
    }
  }

  const canApprove =
    previewState.kind === 'ready' &&
    (previewState.preview.status === 'PENDING_HR_APPROVAL' ||
      previewState.preview.status === 'APPROVED') &&
    approveState.kind !== 'approving' &&
    approveState.kind !== 'done'

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            360度評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">フィードバック承認・公開</h1>
          <p className="mt-2 text-sm text-slate-600">
            変換後のフィードバックを確認し、被評価者へ公開します（HR_MANAGER 専用）。
          </p>
        </div>
        <a
          href="/evaluation/cycles"
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← サイクル一覧
        </a>
      </header>

      {/* 検索フォーム */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-800">対象を指定</h2>
        <form onSubmit={(e) => void handlePreview(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cycleId" className="mb-1 block text-xs font-medium text-slate-600">
                サイクル ID
              </label>
              <input
                id="cycleId"
                type="text"
                value={cycleId}
                onChange={(e) => setCycleId(e.target.value)}
                placeholder="cycle-xxxx"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="subjectId" className="mb-1 block text-xs font-medium text-slate-600">
                被評価者 ID
              </label>
              <input
                id="subjectId"
                type="text"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                placeholder="user-xxxx"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!cycleId.trim() || !subjectId.trim() || previewState.kind === 'loading'}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {previewState.kind === 'loading' ? '読み込み中…' : 'プレビューを取得'}
          </button>
        </form>
      </section>

      {/* エラー */}
      {previewState.kind === 'error' && (
        <div className="mb-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">プレビューの取得に失敗しました</p>
          <p className="mt-1 text-xs">{previewState.message}</p>
        </div>
      )}

      {/* プレビュー */}
      {previewState.kind === 'ready' && (
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">変換後フィードバック</h2>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[previewState.preview.status] ?? 'border-slate-200 bg-slate-50 text-slate-600'}`}
            >
              {STATUS_LABELS[previewState.preview.status] ?? previewState.preview.status}
            </span>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <span>サイクル ID: </span>
            <span className="font-mono font-medium text-slate-700">
              {previewState.preview.cycleId}
            </span>
            <span className="mx-2">·</span>
            <span>被評価者 ID: </span>
            <span className="font-mono font-medium text-slate-700">
              {previewState.preview.subjectId}
            </span>
          </div>

          {/* 要約 */}
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              AI 生成サマリー
            </h3>
            <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
              {previewState.preview.summary}
            </p>
          </div>

          {/* 変換後コメント一覧 */}
          {previewState.preview.transformedBatch.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                変換後コメント（{previewState.preview.transformedBatch.length} 件）
              </h3>
              <ul className="space-y-2">
                {previewState.preview.transformedBatch.map((comment, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm"
                  >
                    {comment}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 承認ボタン */}
          <div className="border-t border-slate-100 pt-4">
            {approveState.kind === 'done' ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-800">✓ 承認・公開が完了しました</p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  被評価者のマイページで閲覧可能になりました。
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  disabled={!canApprove}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {approveState.kind === 'approving' ? '処理中…' : '承認して公開'}
                </button>
                {previewState.preview.status === 'PUBLISHED' && (
                  <p className="text-sm text-slate-500">このフィードバックはすでに公開済みです</p>
                )}
                {previewState.preview.status === 'ARCHIVED' && (
                  <p className="text-sm text-slate-500">このフィードバックはアーカイブ済みです</p>
                )}
              </div>
            )}
            {approveState.kind === 'error' && (
              <p className="mt-2 text-sm text-rose-600">{approveState.message}</p>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
