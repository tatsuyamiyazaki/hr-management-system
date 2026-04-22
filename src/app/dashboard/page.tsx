/**
 * Issue #195 / ダッシュボード リデザイン
 *
 * - GET /api/dashboard/kpi — ロール別 KPI サマリーを取得
 * - サイドバーレイアウト適用後の新デザイン
 */
'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactElement } from 'react'
import type { DashboardSummary, KpiMetric } from '@/lib/dashboard/dashboard-types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardEnvelope {
  readonly success?: boolean
  readonly data?: DashboardSummary
  readonly error?: string
}

type DashboardState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly summary: DashboardSummary }
  | { readonly kind: 'unauthorized'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DASHBOARD_URL = '/api/dashboard/kpi'

const QUICK_ACTIONS: readonly {
  readonly href: string
  readonly label: string
  readonly description: string
  readonly colorClass: string
}[] = [
  {
    href: '/evaluation/cycles',
    label: '評価サイクル',
    description: '進行中のサイクルを確認・管理',
    colorClass: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  },
  {
    href: '/skill-map',
    label: 'スキルマップ',
    description: '組織スキル充足率とレーダーチャート',
    colorClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
  {
    href: '/goals/personal',
    label: '個人目標',
    description: 'OKR / MBO の確認と進捗更新',
    colorClass: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  },
  {
    href: '/one-on-one/schedule',
    label: '1on1',
    description: 'スケジュール・ログを確認',
    colorClass: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
  },
]

const ROLE_LABEL: Record<string, string> = {
  ADMIN: '管理者',
  HR_MANAGER: '人事マネージャー',
  MANAGER: 'マネージャー',
  EMPLOYEE: '社員',
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage(): ReactElement {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(DASHBOARD_URL, { cache: 'no-store' })
        const body = ((await res.json().catch(() => ({}))) ?? {}) as DashboardEnvelope

        if (cancelled) return

        if (res.status === 401 || res.status === 403) {
          setState({
            kind: 'unauthorized',
            message: body.error ?? 'ダッシュボードを表示するにはログインが必要です。',
          })
          return
        }

        if (!res.ok || !body.data) {
          setState({
            kind: 'error',
            message: body.error ?? `ダッシュボードの取得に失敗しました (HTTP ${res.status})`,
          })
          return
        }

        setState({ kind: 'ready', summary: body.data })
      } catch (error) {
        if (cancelled) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : '予期しないエラーが発生しました。',
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-8 py-10">
      <PageHeader state={state} />
      <MetricsSection state={state} />
      <QuickActionsSection />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Header
// ─────────────────────────────────────────────────────────────────────────────

function PageHeader({ state }: { readonly state: DashboardState }): ReactElement {
  const roleLabel =
    state.kind === 'ready' ? (ROLE_LABEL[state.summary.role] ?? state.summary.role) : null

  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
          Dashboard
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          ダッシュボード
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          ロール別の主要指標をひとつの画面で確認できます。
        </p>
      </div>
      {roleLabel && (
        <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
          {roleLabel}ビュー
        </span>
      )}
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Section
// ─────────────────────────────────────────────────────────────────────────────

function MetricsSection({ state }: { readonly state: DashboardState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (state.kind === 'unauthorized') {
    return <AlertBanner tone="warning" title="ログインが必要です" message={state.message} />
  }

  if (state.kind === 'error') {
    return <AlertBanner tone="error" title="KPI を取得できませんでした" message={state.message} />
  }

  const { summary } = state

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>
      {summary.emptyStateMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">データ準備中</p>
          <p className="mt-0.5">{summary.emptyStateMessage}</p>
        </div>
      )}
    </section>
  )
}

function MetricCard({ metric }: { readonly metric: KpiMetric }): ReactElement {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{metric.label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
        {formatMetricValue(metric)}
      </p>
      <p className="mt-1 text-xs font-medium tracking-widest text-slate-400 uppercase">
        {unitLabel(metric.unit)}
      </p>
    </article>
  )
}

function SkeletonCard(): ReactElement {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="mt-4 h-9 w-20 rounded bg-slate-200" />
      <div className="mt-2 h-2 w-12 rounded bg-slate-100" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Actions Section
// ─────────────────────────────────────────────────────────────────────────────

function QuickActionsSection(): ReactElement {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">クイックアクション</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`group rounded-xl border p-4 transition-colors ${action.colorClass}`}
          >
            <p className="text-sm font-semibold">{action.label}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{action.description}</p>
            <p className="mt-3 text-xs font-semibold tracking-widest uppercase opacity-60 group-hover:opacity-100">
              開く →
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function AlertBanner({
  tone,
  title,
  message,
}: {
  readonly tone: 'warning' | 'error'
  readonly title: string
  readonly message: string
}): ReactElement {
  const styles =
    tone === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-rose-300 bg-rose-50 text-rose-900'
  return (
    <div className={`rounded-xl border p-5 text-sm ${styles}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-6 opacity-80">{message}</p>
    </div>
  )
}

function formatMetricValue(metric: KpiMetric): string {
  if (metric.unit === 'count') {
    return new Intl.NumberFormat('ja-JP').format(metric.value)
  }
  if (metric.unit === 'percent') {
    return `${metric.value.toFixed(1)}%`
  }
  return metric.value.toFixed(1)
}

function unitLabel(unit: KpiMetric['unit']): string {
  if (unit === 'count') return 'Count'
  if (unit === 'percent') return 'Percent'
  return 'Score'
}
