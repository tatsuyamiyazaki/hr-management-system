/**
 * Issue #180 / Task 18.2 / Req 11.4, 11.5: 評価者インセンティブ マイページ表示
 *
 * - GET /api/incentive/score?cycleId=X — 現在のサイクルの評価実施件数と累積スコア
 * - cycleId はクエリパラメータで受け取る
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface IncentiveScore {
  readonly evaluationCount: number
  readonly cumulativeScore: number
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type ScoreState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly score: IncentiveScore }

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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  color = 'text-slate-900',
  description,
}: {
  readonly label: string
  readonly value: number
  readonly unit?: string
  readonly color?: string
  readonly description?: string
}): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`text-4xl font-bold tabular-nums ${color}`}>{value}</span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
      {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function IncentivePage(): ReactElement {
  const searchParams = useSearchParams()
  const cycleId = searchParams.get('cycleId') ?? ''

  const [scoreState, setScoreState] = useState<ScoreState>(
    cycleId ? { kind: 'loading' } : { kind: 'idle' },
  )

  useEffect(() => {
    if (!cycleId) return
    setScoreState({ kind: 'loading' })
    void (async () => {
      try {
        const score = await fetchJson<IncentiveScore>(
          `/api/incentive/score?cycleId=${encodeURIComponent(cycleId)}`,
        )
        setScoreState({ kind: 'ready', score })
      } catch (err) {
        setScoreState({ kind: 'error', message: readError(err) })
      }
    })()
  }, [cycleId])

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            360度評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">インセンティブスコア</h1>
          <p className="mt-2 text-sm text-slate-600">
            評価完了件数に応じたインセンティブスコアを確認できます。
          </p>
          {cycleId && (
            <p className="mt-1 text-xs text-slate-500">
              サイクル ID: <span className="font-mono">{cycleId}</span>
            </p>
          )}
        </div>
        <a
          href="/evaluation/cycles"
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← サイクル一覧
        </a>
      </header>

      {!cycleId ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          URL に <span className="font-mono">?cycleId=...</span> を付けてアクセスしてください
        </div>
      ) : (
        <>
          {scoreState.kind === 'loading' && (
            <div className="py-16 text-center text-sm text-slate-400">
              <span className="animate-pulse">読み込み中…</span>
            </div>
          )}

          {scoreState.kind === 'error' && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
              <p className="font-semibold">データの取得に失敗しました</p>
              <p className="mt-1 text-xs">{scoreState.message}</p>
            </div>
          )}

          {scoreState.kind === 'ready' && (
            <div className="space-y-6">
              {/* スコアカード */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatCard
                  label="評価実施件数"
                  value={scoreState.score.evaluationCount}
                  unit="件"
                  color="text-indigo-600"
                  description="品質ゲートを通過した評価のみカウント"
                />
                <StatCard
                  label="累積インセンティブスコア"
                  value={scoreState.score.cumulativeScore}
                  unit="pt"
                  color="text-emerald-600"
                  description="総合評価への加算に使用されます"
                />
              </div>

              {/* 説明 */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 font-semibold text-slate-800">スコアの計算方法</h2>
                <dl className="space-y-2 text-sm text-slate-600">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium text-slate-700">対象:</dt>
                    <dd>AI コーチング品質ゲートを通過した評価のみ加算されます</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium text-slate-700">計算式:</dt>
                    <dd>
                      累積スコア = 評価件数 × 係数 <span className="font-mono text-xs">k</span>
                      （サイクル設定に依存）
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium text-slate-700">反映:</dt>
                    <dd>サイクル終了後の総合評価（360度評価スコア）に加算されます</dd>
                  </div>
                </dl>
              </section>

              {/* ゼロ件の案内 */}
              {scoreState.score.evaluationCount === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold">まだ評価が記録されていません</p>
                  <p className="mt-1 text-xs">
                    評価フォームから評価を提出すると、スコアが加算されます。
                  </p>
                  <a
                    href={`/evaluation/assignments?cycleId=${encodeURIComponent(cycleId)}`}
                    className="mt-2 inline-block text-xs font-medium text-amber-700 underline hover:text-amber-900"
                  >
                    評価アサイン一覧へ →
                  </a>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}
