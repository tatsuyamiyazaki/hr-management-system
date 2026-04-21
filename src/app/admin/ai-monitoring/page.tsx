'use client'

import { useEffect, useState, type ReactElement, type ReactNode } from 'react'

interface DashboardSnapshot {
  readonly costSeries: {
    readonly points: readonly {
      readonly bucket: string
      readonly costUsd: number
      readonly requests: number
    }[]
  }
  readonly topUsers: readonly {
    readonly userId: string
    readonly costUsd: number
    readonly requests: number
  }[]
  readonly failureRate: {
    readonly failureCount: number
    readonly totalAttempts: number
    readonly failureRate: number
    readonly byErrorCategory: Record<string, number>
  }
  readonly providerComparison: {
    readonly rows: readonly {
      readonly provider: string
      readonly requests: number
      readonly costUsd: number
      readonly avgLatencyMs: number
      readonly cacheHitRate: number
    }[]
  }
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: DashboardSnapshot }

export default function AIMonitoringPage(): ReactElement {
  const [range, setRange] = useState('30d')
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    void (async () => {
      setState({ kind: 'loading' })
      const res = await fetch(`/api/ai-monitoring/dashboard?range=${range}`, { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as {
        data?: DashboardSnapshot
        error?: string
      }

      if (!res.ok || !body.data) {
        setState({ kind: 'error', message: body.error ?? `HTTP ${res.status}` })
        return
      }

      setState({ kind: 'ready', snapshot: body.data })
    })()
  }, [range])

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_40%,#f8fafc_100%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.3em] text-sky-700 uppercase">
                AI Operations
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                AI運用ダッシュボード
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                コスト推移、利用上位ユーザー、プロバイダ比較、失敗率を ADMIN 向けに一覧化します。
              </p>
            </div>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              期間
              <select
                value={range}
                onChange={(event) => setRange(event.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-400"
              >
                <option value="7d">直近7日</option>
                <option value="30d">直近30日</option>
                <option value="90d">直近90日</option>
              </select>
            </label>
          </div>
        </section>

        {state.kind === 'loading' ? <Panel>AI利用データを読み込み中です...</Panel> : null}
        {state.kind === 'error' ? <Panel tone="error">{state.message}</Panel> : null}
        {state.kind === 'ready' ? (
          <div className="grid gap-6">
            <section className="grid gap-4 md:grid-cols-3">
              <MetricCard
                label="総試行回数"
                value={String(state.snapshot.failureRate.totalAttempts)}
                helper="成功 + 失敗の合計"
              />
              <MetricCard
                label="失敗件数"
                value={String(state.snapshot.failureRate.failureCount)}
                helper="監視対象期間内のAIエラー"
              />
              <MetricCard
                label="失敗率"
                value={`${(state.snapshot.failureRate.failureRate * 100).toFixed(1)}%`}
                helper="失敗件数 / 総試行回数"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <h2 className="text-lg font-semibold text-slate-950">コスト推移</h2>
                <div className="mt-4 grid gap-3">
                  {state.snapshot.costSeries.points.map((point) => (
                    <div
                      key={point.bucket}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-slate-700">{point.bucket}</span>
                      <span className="text-sm text-slate-600">
                        ${point.costUsd.toFixed(2)} / {point.requests} requests
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <h2 className="text-lg font-semibold text-slate-950">プロバイダ比較</h2>
                <div className="mt-4 grid gap-3">
                  {state.snapshot.providerComparison.rows.map((row) => (
                    <div
                      key={row.provider}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <p className="font-semibold text-slate-900">{row.provider}</p>
                      <p className="mt-1">
                        ${row.costUsd.toFixed(2)} / {row.requests} requests / avg{' '}
                        {Math.round(row.avgLatencyMs)}ms
                      </p>
                      <p className="mt-1 text-slate-500">
                        Cache hit {(row.cacheHitRate * 100).toFixed(0)}%
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <h2 className="text-lg font-semibold text-slate-950">利用上位ユーザー</h2>
                <div className="mt-4 grid gap-3">
                  {state.snapshot.topUsers.map((row) => (
                    <div
                      key={row.userId}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-slate-700">{row.userId}</span>
                      <span className="text-sm text-slate-600">
                        ${row.costUsd.toFixed(2)} / {row.requests} requests
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <h2 className="text-lg font-semibold text-slate-950">エラーカテゴリ内訳</h2>
                <div className="mt-4 grid gap-3">
                  {Object.entries(state.snapshot.failureRate.byErrorCategory).map(
                    ([key, count]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                      >
                        <span className="text-sm font-medium text-slate-700">{key}</span>
                        <span className="text-sm text-slate-600">{count} 件</span>
                      </div>
                    ),
                  )}
                </div>
              </Panel>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}

function Panel(props: {
  readonly children: ReactNode
  readonly tone?: 'neutral' | 'error'
}): ReactElement {
  const className =
    props.tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : 'border-slate-200 bg-white text-slate-700'

  return (
    <section className={`rounded-3xl border p-6 shadow-sm ${className}`}>{props.children}</section>
  )
}

function MetricCard(props: {
  readonly label: string
  readonly value: string
  readonly helper: string
}): ReactElement {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{props.label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{props.value}</p>
      <p className="mt-2 text-sm text-slate-600">{props.helper}</p>
    </article>
  )
}
