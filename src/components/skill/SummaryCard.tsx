/**
 * Issue #37 / Req 4.1: 組織スキルサマリカード
 *
 * - 全社員数 / 登録スキル件数 / 平均充足度 / トップカテゴリを 1 枚のカードに集約
 * - 平均充足度は円形リングプログレス (SVG stroke-dasharray) で可視化
 */
'use client'

import type { ReactElement } from 'react'
import type { SkillSummary } from '@/lib/skill/skill-analytics-types'

interface SummaryCardProps {
  readonly summary: SkillSummary
}

function clampRate(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0
  if (v >= 1) return 1
  return v
}

function formatPercent(rate: number): string {
  return `${(clampRate(rate) * 100).toFixed(1)}%`
}

export function SummaryCard({ summary }: SummaryCardProps): ReactElement {
  const rate = clampRate(summary.averageFulfillmentRate)

  return (
    <section
      data-testid="skill-summary-card"
      aria-label="組織スキルサマリ"
      className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-[auto_1fr]"
    >
      <FulfillmentRing rate={rate} />

      <div className="flex flex-col gap-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Organization skill
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">組織サマリ</h2>
        </header>

        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <MetricEntry label="対象社員" value={`${summary.totalEmployees}名`} />
          <MetricEntry label="登録スキル" value={`${summary.totalSkillEntries}件`} />
          <MetricEntry label="平均充足度" value={formatPercent(rate)} highlight />
        </dl>

        <TopCategories summary={summary} />
      </div>
    </section>
  )
}

interface MetricEntryProps {
  readonly label: string
  readonly value: string
  readonly highlight?: boolean
}

function MetricEntry({ label, value, highlight }: MetricEntryProps): ReactElement {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd
        className={
          highlight
            ? 'mt-1 text-2xl font-semibold tabular-nums text-emerald-700'
            : 'mt-1 text-2xl font-semibold tabular-nums text-slate-900'
        }
      >
        {value}
      </dd>
    </div>
  )
}

interface FulfillmentRingProps {
  readonly rate: number
}

function FulfillmentRing({ rate }: FulfillmentRingProps): ReactElement {
  const size = 120
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = circumference * rate

  return (
    <div className="flex items-center justify-center">
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={`平均充足度 ${formatPercent(rate)}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#059669"
          strokeWidth={stroke}
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          className="fill-slate-900 font-semibold"
          fontSize="18"
        >
          {formatPercent(rate)}
        </text>
      </svg>
    </div>
  )
}

function TopCategories({ summary }: { readonly summary: SkillSummary }): ReactElement {
  if (summary.topCategories.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        カテゴリ別の充足度を算出するためのデータがまだありません。
      </p>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        充足度トップカテゴリ
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {summary.topCategories.map((c) => (
          <li key={c.category} className="flex items-center gap-3">
            <span className="w-24 truncate text-sm text-slate-700">{c.category}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                style={{ width: `${clampRate(c.fulfillmentRate) * 100}%` }}
              />
            </span>
            <span className="w-14 text-right text-xs tabular-nums text-slate-600">
              {formatPercent(c.fulfillmentRate)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
