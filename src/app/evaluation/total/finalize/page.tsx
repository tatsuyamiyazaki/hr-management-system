/**
 * Issue #181 / Task 19.3 / Req 12.5, 12.6: 総合評価 確定・クローズ / ADMIN修正画面
 *
 * - POST /api/total-evaluation/finalize    — サイクル確定（HR_MANAGER/ADMIN）
 * - PUT  /api/total-evaluation/correction  — 確定後スコア修正（ADMIN）
 */
'use client'

import { useState, type ReactElement, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

interface TotalEvaluationResult {
  readonly subjectId: string
  readonly finalScore: number
  readonly status: string
}

type FinalizeState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'confirming' }
  | { readonly kind: 'finalizing' }
  | { readonly kind: 'done'; readonly results: readonly TotalEvaluationResult[] }
  | { readonly kind: 'error'; readonly message: string }

interface CorrectionForm {
  subjectId: string
  performanceScore: string
  goalScore: string
  feedbackScore: string
  incentiveAdjustment: string
  performanceWeight: string
  goalWeight: string
  feedbackWeight: string
  reason: string
}

type CorrectionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'done'; readonly subjectId: string }
  | { readonly kind: 'error'; readonly message: string }

const EMPTY_CORRECTION: CorrectionForm = {
  subjectId: '',
  performanceScore: '',
  goalScore: '',
  feedbackScore: '',
  incentiveAdjustment: '0',
  performanceWeight: '',
  goalWeight: '',
  feedbackWeight: '',
  reason: '',
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

function parseNum(s: string): number | null {
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function NumberInput({
  id,
  label,
  value,
  onChange,
  disabled,
  step = '1',
  min,
  max,
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly onChange: (v: string) => void
  readonly disabled: boolean
  readonly step?: string
  readonly min?: string
  readonly max?: string
}): ReactElement {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TotalEvaluationFinalizePage(): ReactElement {
  const searchParams = useSearchParams()
  const cycleId = searchParams.get('cycleId') ?? ''

  const [finalizeState, setFinalizeState] = useState<FinalizeState>({ kind: 'idle' })
  const [correction, setCorrection] = useState<CorrectionForm>(EMPTY_CORRECTION)
  const [correctionState, setCorrectionState] = useState<CorrectionState>({ kind: 'idle' })

  // ── Finalize ──────────────────────────────────────────────────────────────

  async function handleFinalize(): Promise<void> {
    if (!cycleId) return
    setFinalizeState({ kind: 'finalizing' })
    try {
      const results = await fetchJson<TotalEvaluationResult[]>('/api/total-evaluation/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId }),
      })
      setFinalizeState({ kind: 'done', results: results ?? [] })
    } catch (err) {
      setFinalizeState({ kind: 'error', message: readError(err) })
    }
  }

  // ── Correction ────────────────────────────────────────────────────────────

  const cPerf = parseNum(correction.performanceScore)
  const cGoal = parseNum(correction.goalScore)
  const cFeed = parseNum(correction.feedbackScore)
  const cIncent = parseNum(correction.incentiveAdjustment)
  const cPW = parseNum(correction.performanceWeight)
  const cGW = parseNum(correction.goalWeight)
  const cFW = parseNum(correction.feedbackWeight)

  const weightSum = cPW !== null && cGW !== null && cFW !== null ? cPW + cGW + cFW : null
  const weightValid = weightSum !== null && Math.abs(weightSum - 1) <= 1e-4

  const canCorrect =
    correction.subjectId.trim().length > 0 &&
    cPerf !== null &&
    cGoal !== null &&
    cFeed !== null &&
    cIncent !== null &&
    weightValid &&
    correction.reason.trim().length > 0 &&
    correctionState.kind !== 'saving'

  async function handleCorrection(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!canCorrect || !cycleId) return
    setCorrectionState({ kind: 'saving' })
    try {
      await fetchJson<null>('/api/total-evaluation/correction', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId,
          subjectId: correction.subjectId.trim(),
          performanceScore: cPerf,
          goalScore: cGoal,
          feedbackScore: cFeed,
          incentiveAdjustment: cIncent,
          performanceWeight: cPW,
          goalWeight: cGW,
          feedbackWeight: cFW,
          reason: correction.reason.trim(),
        }),
      })
      setCorrectionState({ kind: 'done', subjectId: correction.subjectId.trim() })
      setCorrection(EMPTY_CORRECTION)
    } catch (err) {
      setCorrectionState({ kind: 'error', message: readError(err) })
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            総合評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">確定・クローズ</h1>
          <p className="mt-2 text-sm text-slate-600">
            全社員の総合評価を確定し、評価サイクルをクローズします。
          </p>
          {cycleId && (
            <p className="mt-1 text-xs text-slate-500">
              サイクル ID: <span className="font-mono">{cycleId}</span>
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

      {!cycleId ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          URL に <span className="font-mono">?cycleId=...</span> を付けてアクセスしてください
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── 確定セクション ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-semibold text-slate-800">評価を確定する</h2>
            <p className="mb-4 text-sm text-slate-600">
              確定すると全社員のスコアが FINALIZED 状態に移行します。この操作は取り消せません。
            </p>

            {finalizeState.kind === 'idle' && (
              <button
                type="button"
                onClick={() => setFinalizeState({ kind: 'confirming' })}
                className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                確定・クローズ
              </button>
            )}

            {finalizeState.kind === 'confirming' && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <p className="mb-3 text-sm font-semibold text-rose-800">
                  本当に確定しますか？この操作は元に戻せません。
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handleFinalize()}
                    className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700"
                  >
                    確定する
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinalizeState({ kind: 'idle' })}
                    className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {finalizeState.kind === 'finalizing' && (
              <div className="py-4 text-center text-sm text-slate-400">
                <span className="animate-pulse">確定処理中…</span>
              </div>
            )}

            {finalizeState.kind === 'error' && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
                <p className="font-semibold">確定に失敗しました</p>
                <p className="mt-1 text-xs">{finalizeState.message}</p>
                <button
                  type="button"
                  onClick={() => setFinalizeState({ kind: 'idle' })}
                  className="mt-2 text-xs font-medium text-rose-700 underline hover:text-rose-900"
                >
                  再試行
                </button>
              </div>
            )}

            {finalizeState.kind === 'done' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-800">
                    ✓ 確定が完了しました（{finalizeState.results.length} 件）
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-700">
                    全社員の評価が FINALIZED になりました。
                  </p>
                </div>
                {finalizeState.results.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">
                            社員 ID
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-slate-500">
                            最終スコア
                          </th>
                          <th className="px-4 py-2 text-center font-medium text-slate-500">
                            ステータス
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {finalizeState.results.map((r) => (
                          <tr key={r.subjectId} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-mono text-slate-700">{r.subjectId}</td>
                            <td className="px-4 py-2 text-right text-slate-700 tabular-nums">
                              {r.finalScore.toFixed(1)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── ADMIN 修正セクション ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 font-semibold text-slate-800">確定後スコア修正（ADMIN）</h2>
            <p className="mb-4 text-sm text-slate-600">
              確定後に個別社員のスコアを修正します。ADMIN 権限が必要です。
            </p>

            {correctionState.kind === 'done' && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-800">
                  ✓ {correctionState.subjectId} のスコアを修正しました
                </p>
              </div>
            )}

            <form onSubmit={(e) => void handleCorrection(e)} className="space-y-4">
              {/* 社員ID */}
              <div>
                <label
                  htmlFor="corrSubjectId"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  社員 ID <span className="text-rose-500">*</span>
                </label>
                <input
                  id="corrSubjectId"
                  type="text"
                  value={correction.subjectId}
                  onChange={(e) => setCorrection((f) => ({ ...f, subjectId: e.target.value }))}
                  disabled={correctionState.kind === 'saving'}
                  placeholder="user-xxxx"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              {/* スコア */}
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  スコア（0〜100）
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <NumberInput
                    id="corrPerf"
                    label="業績スコア"
                    value={correction.performanceScore}
                    onChange={(v) => setCorrection((f) => ({ ...f, performanceScore: v }))}
                    disabled={correctionState.kind === 'saving'}
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <NumberInput
                    id="corrGoal"
                    label="目標スコア"
                    value={correction.goalScore}
                    onChange={(v) => setCorrection((f) => ({ ...f, goalScore: v }))}
                    disabled={correctionState.kind === 'saving'}
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <NumberInput
                    id="corrFeed"
                    label="360度スコア"
                    value={correction.feedbackScore}
                    onChange={(v) => setCorrection((f) => ({ ...f, feedbackScore: v }))}
                    disabled={correctionState.kind === 'saving'}
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <NumberInput
                    id="corrIncent"
                    label="インセンティブ加算"
                    value={correction.incentiveAdjustment}
                    onChange={(v) => setCorrection((f) => ({ ...f, incentiveAdjustment: v }))}
                    disabled={correctionState.kind === 'saving'}
                    step="0.1"
                    min="-100"
                    max="100"
                  />
                </div>
              </div>

              {/* ウェイト */}
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  ウェイト（合計 = 1.0）
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <NumberInput
                    id="corrPW"
                    label="業績ウェイト"
                    value={correction.performanceWeight}
                    onChange={(v) => setCorrection((f) => ({ ...f, performanceWeight: v }))}
                    disabled={correctionState.kind === 'saving'}
                    step="0.01"
                    min="0"
                    max="1"
                  />
                  <NumberInput
                    id="corrGW"
                    label="目標ウェイト"
                    value={correction.goalWeight}
                    onChange={(v) => setCorrection((f) => ({ ...f, goalWeight: v }))}
                    disabled={correctionState.kind === 'saving'}
                    step="0.01"
                    min="0"
                    max="1"
                  />
                  <NumberInput
                    id="corrFW"
                    label="360度ウェイト"
                    value={correction.feedbackWeight}
                    onChange={(v) => setCorrection((f) => ({ ...f, feedbackWeight: v }))}
                    disabled={correctionState.kind === 'saving'}
                    step="0.01"
                    min="0"
                    max="1"
                  />
                </div>
                {weightSum !== null && (
                  <p
                    className={`mt-1 text-xs font-medium ${weightValid ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    合計: {weightSum.toFixed(4)}{' '}
                    {weightValid ? '✓' : '✗ 合計が 1.0 になるように設定してください'}
                  </p>
                )}
              </div>

              {/* 理由 */}
              <div>
                <label
                  htmlFor="corrReason"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  修正理由 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="corrReason"
                  rows={3}
                  value={correction.reason}
                  onChange={(e) => setCorrection((f) => ({ ...f, reason: e.target.value }))}
                  disabled={correctionState.kind === 'saving'}
                  placeholder="修正する理由を入力してください"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={!canCorrect}
                  className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {correctionState.kind === 'saving' ? '保存中…' : 'スコアを修正'}
                </button>
                {correctionState.kind === 'error' && (
                  <p className="text-sm text-rose-600">{correctionState.message}</p>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
