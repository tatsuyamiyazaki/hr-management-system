/**
 * Issue #181 / Task 19.2 / Req 12.3: 総合評価 個別ウェイト上書き画面
 *
 * - GET /api/total-evaluation/override?cycleId=X&subjectId=Y — 現在のウェイト上書き取得
 * - PUT /api/total-evaluation/override                        — ウェイト上書き保存
 */
'use client'

import { useEffect, useState, type ReactElement, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WeightOverride {
  readonly cycleId: string
  readonly subjectId: string
  readonly performanceWeight: number
  readonly goalWeight: number
  readonly feedbackWeight: number
  readonly reason: string
  readonly adjustedBy: string
  readonly adjustedAt: string
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

interface WeightForm {
  performanceWeight: string
  goalWeight: string
  feedbackWeight: string
  reason: string
}

type OverrideState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly existing: WeightOverride | null }

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
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

function pct(w: number): string {
  return `${Math.round(w * 100)}%`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function WeightField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly onChange: (v: string) => void
  readonly disabled: boolean
}): ReactElement {
  const num = parseFloat(value)
  const displayPct = isNaN(num) ? '—' : pct(num)

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-28 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
        />
        <span className="text-sm text-slate-500">{displayPct}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TotalEvaluationOverridePage(): ReactElement {
  const searchParams = useSearchParams()
  const cycleId = searchParams.get('cycleId') ?? ''
  const subjectId = searchParams.get('subjectId') ?? ''

  const [overrideState, setOverrideState] = useState<OverrideState>(
    cycleId && subjectId ? { kind: 'loading' } : { kind: 'idle' },
  )
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [form, setForm] = useState<WeightForm>({
    performanceWeight: '0.4',
    goalWeight: '0.4',
    feedbackWeight: '0.2',
    reason: '',
  })

  useEffect(() => {
    if (!cycleId || !subjectId) return
    setOverrideState({ kind: 'loading' })
    void (async () => {
      try {
        const existing = await fetchJson<WeightOverride | null>(
          `/api/total-evaluation/override?cycleId=${encodeURIComponent(cycleId)}&subjectId=${encodeURIComponent(subjectId)}`,
        )
        setOverrideState({ kind: 'ready', existing })
        if (existing) {
          setForm({
            performanceWeight: existing.performanceWeight.toString(),
            goalWeight: existing.goalWeight.toString(),
            feedbackWeight: existing.feedbackWeight.toString(),
            reason: '',
          })
        }
      } catch (err) {
        setOverrideState({ kind: 'error', message: readError(err) })
      }
    })()
  }, [cycleId, subjectId])

  const perf = parseFloat(form.performanceWeight)
  const goal = parseFloat(form.goalWeight)
  const feed = parseFloat(form.feedbackWeight)
  const weightSum = isNaN(perf) || isNaN(goal) || isNaN(feed) ? null : perf + goal + feed
  const sumValid = weightSum !== null && Math.abs(weightSum - 1) <= 1e-4

  const canSave =
    sumValid &&
    form.reason.trim().length > 0 &&
    saveState.kind !== 'saving' &&
    saveState.kind !== 'done'

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!canSave) return
    setSaveState({ kind: 'saving' })
    try {
      await fetchJson<null>('/api/total-evaluation/override', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId,
          subjectId,
          performanceWeight: perf,
          goalWeight: goal,
          feedbackWeight: feed,
          reason: form.reason.trim(),
        }),
      })
      setSaveState({ kind: 'done' })
    } catch (err) {
      setSaveState({ kind: 'error', message: readError(err) })
    }
  }

  const isBusy = saveState.kind === 'saving'

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            総合評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">ウェイト上書き</h1>
          <p className="mt-2 text-sm text-slate-600">
            個別社員のスコア計算ウェイトを変更します（HR_MANAGER 専用）。
          </p>
          {cycleId && subjectId && (
            <p className="mt-1 text-xs text-slate-500">
              サイクル ID: <span className="font-mono">{cycleId}</span>
              <span className="mx-2">·</span>
              社員 ID: <span className="font-mono">{subjectId}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {cycleId && (
            <a
              href={`/evaluation/total/preview?cycleId=${encodeURIComponent(cycleId)}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← プレビューへ戻る
            </a>
          )}
          <a
            href="/evaluation/cycles"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← サイクル一覧
          </a>
        </div>
      </header>

      {!cycleId || !subjectId ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          URL に <span className="font-mono">?cycleId=...&amp;subjectId=...</span>{' '}
          を付けてアクセスしてください
        </div>
      ) : (
        <div className="space-y-6">
          {/* 読み込み中 */}
          {overrideState.kind === 'loading' && (
            <div className="py-16 text-center text-sm text-slate-400">
              <span className="animate-pulse">読み込み中…</span>
            </div>
          )}

          {/* 取得エラー */}
          {overrideState.kind === 'error' && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
              <p className="font-semibold">データの取得に失敗しました</p>
              <p className="mt-1 text-xs">{overrideState.message}</p>
            </div>
          )}

          {/* 既存上書き情報 */}
          {overrideState.kind === 'ready' && overrideState.existing && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">既存のウェイト上書きがあります</p>
              <p className="mt-1 text-xs">
                調整者:{' '}
                <span className="font-mono font-medium">{overrideState.existing.adjustedBy}</span>
                <span className="mx-2">·</span>
                調整日時: {formatDate(overrideState.existing.adjustedAt)}
              </p>
              <p className="mt-1 text-xs">
                現在のウェイト: 業績{' '}
                <span className="font-medium">{pct(overrideState.existing.performanceWeight)}</span>
                {' / '}目標{' '}
                <span className="font-medium">{pct(overrideState.existing.goalWeight)}</span>
                {' / '}360度{' '}
                <span className="font-medium">{pct(overrideState.existing.feedbackWeight)}</span>
              </p>
            </div>
          )}

          {/* フォーム */}
          {(overrideState.kind === 'ready' || overrideState.kind === 'idle') && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-slate-800">ウェイトを設定</h2>
              <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <WeightField
                    id="performanceWeight"
                    label="業績ウェイト"
                    value={form.performanceWeight}
                    onChange={(v) => setForm((f) => ({ ...f, performanceWeight: v }))}
                    disabled={isBusy}
                  />
                  <WeightField
                    id="goalWeight"
                    label="目標ウェイト"
                    value={form.goalWeight}
                    onChange={(v) => setForm((f) => ({ ...f, goalWeight: v }))}
                    disabled={isBusy}
                  />
                  <WeightField
                    id="feedbackWeight"
                    label="360度ウェイト"
                    value={form.feedbackWeight}
                    onChange={(v) => setForm((f) => ({ ...f, feedbackWeight: v }))}
                    disabled={isBusy}
                  />
                </div>

                {/* 合計バリデーション */}
                <div
                  className={`rounded-lg px-3 py-2 text-xs font-medium ${
                    weightSum === null
                      ? 'bg-slate-50 text-slate-400'
                      : sumValid
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  合計:{' '}
                  {weightSum === null
                    ? '—'
                    : `${weightSum.toFixed(4)} ${sumValid ? '✓ 合計 = 1.0' : '✗ 合計が 1.0 になるように設定してください'}`}
                </div>

                {/* 理由 */}
                <div>
                  <label htmlFor="reason" className="mb-1 block text-xs font-medium text-slate-600">
                    上書き理由 <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="reason"
                    rows={3}
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    disabled={isBusy}
                    placeholder="上書きする理由を入力してください"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>

                {/* 保存ボタン */}
                {saveState.kind === 'done' ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-sm font-semibold text-emerald-800">
                      ✓ ウェイトを保存しました
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-700">
                      次回の総合評価計算に反映されます。
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <button
                      type="submit"
                      disabled={!canSave}
                      className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isBusy ? '保存中…' : 'ウェイトを保存'}
                    </button>
                    {!sumValid && weightSum !== null && (
                      <p className="text-xs text-rose-600">ウェイトの合計を 1.0 にしてください</p>
                    )}
                  </div>
                )}

                {saveState.kind === 'error' && (
                  <p className="text-sm text-rose-600">{saveState.message}</p>
                )}
              </form>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
