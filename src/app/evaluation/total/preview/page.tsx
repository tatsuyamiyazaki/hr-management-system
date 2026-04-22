/**
 * Issue #181 / Task 19.1 / Req 12.1, 12.2, 12.4: 総合評価 確定前プレビュー画面
 *
 * - GET /api/total-evaluation/preview?cycleId=X — 全社員の総合評価プレビュー（HR_MANAGER/ADMIN）
 * - cycleId をクエリパラメータで受け取る
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TotalEvaluationPreviewResult {
  readonly subjectId: string
  readonly gradeId: string
  readonly gradeLabel: string
  readonly performanceScore: number
  readonly goalScore: number
  readonly feedbackScore: number
  readonly incentiveAdjustment: number
  readonly performanceWeight: number
  readonly goalWeight: number
  readonly feedbackWeight: number
  readonly finalScore: number
  readonly status: string
  readonly hasWeightOverride: boolean
  readonly isNearGradeThreshold: boolean
  readonly nearestGradeThresholdScore: number | null
  readonly thresholdDistancePercent: number | null
}

interface TotalEvaluationPreview {
  readonly cycleId: string
  readonly results: readonly TotalEvaluationPreviewResult[]
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
  | { readonly kind: 'ready'; readonly preview: TotalEvaluationPreview }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { readonly score: number }): ReactElement {
  const clamped = Math.min(100, Math.max(0, score))
  const color = clamped >= 80 ? 'bg-emerald-500' : clamped >= 60 ? 'bg-indigo-400' : 'bg-amber-400'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-slate-600 tabular-nums">{score.toFixed(1)}</span>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  unit,
  color = 'text-slate-900',
}: {
  readonly label: string
  readonly value: number
  readonly unit: string
  readonly color?: string
}): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
        <span className="text-xs text-slate-400">{unit}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TotalEvaluationPreviewPage(): ReactElement {
  const searchParams = useSearchParams()
  const cycleId = searchParams.get('cycleId') ?? ''

  const [state, setState] = useState<PreviewState>(cycleId ? { kind: 'loading' } : { kind: 'idle' })

  useEffect(() => {
    if (!cycleId) return
    setState({ kind: 'loading' })
    void (async () => {
      try {
        const preview = await fetchJson<TotalEvaluationPreview>(
          `/api/total-evaluation/preview?cycleId=${encodeURIComponent(cycleId)}`,
        )
        setState({ kind: 'ready', preview })
      } catch (err) {
        setState({ kind: 'error', message: readError(err) })
      }
    })()
  }, [cycleId])

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            総合評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">確定前プレビュー</h1>
          <p className="mt-2 text-sm text-slate-600">
            全社員の総合評価スコアを確認します。確定は「確定・クローズ」画面で行います。
          </p>
          {cycleId && (
            <p className="mt-1 text-xs text-slate-500">
              サイクル ID: <span className="font-mono">{cycleId}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {cycleId && (
            <>
              <a
                href={`/evaluation/total/override?cycleId=${encodeURIComponent(cycleId)}`}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ウェイト上書き
              </a>
              <a
                href={`/evaluation/total/finalize?cycleId=${encodeURIComponent(cycleId)}`}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                確定・クローズ →
              </a>
            </>
          )}
          <a
            href="/evaluation/cycles"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← サイクル一覧
          </a>
        </div>
      </header>

      {!cycleId && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          URL に <span className="font-mono">?cycleId=...</span> を付けてアクセスしてください
        </div>
      )}

      {state.kind === 'loading' && (
        <div className="py-16 text-center text-sm text-slate-400">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-semibold">プレビューの取得に失敗しました</p>
          <p className="mt-1 text-xs">{state.message}</p>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="space-y-4">
          {/* 集計サマリー */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard label="対象者数" value={state.preview.results.length} unit="名" />
            <SummaryCard
              label="平均スコア"
              value={
                state.preview.results.length > 0
                  ? parseFloat(
                      (
                        state.preview.results.reduce((s, r) => s + r.finalScore, 0) /
                        state.preview.results.length
                      ).toFixed(1),
                    )
                  : 0
              }
              unit="pt"
              color="text-indigo-600"
            />
            <SummaryCard
              label="ウェイト上書き"
              value={state.preview.results.filter((r) => r.hasWeightOverride).length}
              unit="件"
              color="text-amber-600"
            />
            <SummaryCard
              label="等級境界注意"
              value={state.preview.results.filter((r) => r.isNearGradeThreshold).length}
              unit="件"
              color="text-rose-600"
            />
          </div>

          {/* テーブル */}
          {state.preview.results.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
              プレビューデータがありません
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                        社員 ID
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">
                        等級
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                        業績
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                        目標
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                        360度
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                        加算
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                        最終スコア
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">
                        フラグ
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.preview.results.map((r) => (
                      <tr key={r.subjectId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">
                          {r.subjectId}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                            {r.gradeLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-600">
                          {r.performanceScore.toFixed(1)}
                          <span className="ml-1 text-slate-400">({pct(r.performanceWeight)})</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-600">
                          {r.goalScore.toFixed(1)}
                          <span className="ml-1 text-slate-400">({pct(r.goalWeight)})</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-600">
                          {r.feedbackScore.toFixed(1)}
                          <span className="ml-1 text-slate-400">({pct(r.feedbackWeight)})</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-emerald-600">
                          {r.incentiveAdjustment > 0
                            ? `+${r.incentiveAdjustment.toFixed(1)}`
                            : r.incentiveAdjustment.toFixed(1)}
                        </td>
                        <td className="px-4 py-3">
                          <ScoreBar score={r.finalScore} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            {r.hasWeightOverride && (
                              <span
                                title="ウェイト上書きあり"
                                className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700"
                              >
                                W
                              </span>
                            )}
                            {r.isNearGradeThreshold && (
                              <span
                                title={`等級境界から ${r.thresholdDistancePercent?.toFixed(1)}%`}
                                className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700"
                              >
                                ±{r.thresholdDistancePercent?.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`/evaluation/total/override?cycleId=${encodeURIComponent(cycleId)}&subjectId=${encodeURIComponent(r.subjectId)}`}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            上書き
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
