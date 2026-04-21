'use client'

import type { ReactElement } from 'react'
import type { DashboardSummary, KpiMetric } from '@/lib/dashboard/dashboard-types'

interface KpiSummaryPanelProps {
  readonly summary: DashboardSummary
}

const roleLabelMap: Record<DashboardSummary['role'], string> = {
  ADMIN: '管理者ビュー',
  HR_MANAGER: '人事ビュー',
  MANAGER: 'マネージャービュー',
  EMPLOYEE: 'マイビュ―',
}

export function KpiSummaryPanel({ summary }: KpiSummaryPanelProps): ReactElement {
  return (
    <section
      data-testid="kpi-summary-panel"
      aria-label="KPIダッシュボード"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.25em] text-sky-700 uppercase">
            Dashboard
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            ロール別 KPI ダッシュボード
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            評価、目標、スキル、インセンティブの主要指標を現在のロールに合わせて表示します。
          </p>
        </div>
        <div className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
          {roleLabelMap[summary.role]}
        </div>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      {summary.emptyStateMessage && (
        <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-semibold">データ準備中</p>
          <p className="mt-1 leading-6">{summary.emptyStateMessage}</p>
        </div>
      )}
    </section>
  )
}

function MetricCard({ metric }: { readonly metric: KpiMetric }): ReactElement {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-medium text-slate-600">{metric.label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {formatMetricValue(metric)}
      </p>
      <p className="mt-2 text-xs tracking-[0.2em] text-slate-400 uppercase">
        {metric.unit === 'count' ? 'Count' : metric.unit === 'percent' ? 'Percent' : 'Score'}
      </p>
    </article>
  )
}

function formatMetricValue(metric: KpiMetric): string {
  if (metric.unit === 'count') {
    return new Intl.NumberFormat('ja-JP').format(metric.value)
  }

  if (metric.unit === 'percent') {
    return `${metric.value.toFixed(2)}%`
  }

  return metric.value.toFixed(1)
}
