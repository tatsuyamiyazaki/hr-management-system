/**
 * Issue #200: レポート画面
 *
 * - レポートタイプカード × 4
 * - 評価完了率 — 部署別横棒グラフ（CSS ベース、API 未実装時はモックデータ）
 * - 定期配信レポート一覧テーブル
 *
 * GET /api/reports/summary               — 保存済み件数・配信件数
 * GET /api/reports/evaluation-completion — 部署別評価完了率
 * GET /api/reports/schedules             — 定期配信一覧
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

interface ReportSummary {
  readonly savedCount: number
  readonly scheduleCount: number
}

interface DeptCompletion {
  readonly departmentName: string
  readonly rate: number // 0–100
}

interface EvaluationCompletion {
  readonly period: string
  readonly departments: readonly DeptCompletion[]
}

interface ReportSchedule {
  readonly id: string
  readonly name: string
  readonly recipients: readonly string[]
  readonly frequency: 'daily' | 'weekly' | 'monthly'
  readonly nextDeliveryAt: string // ISO 8601
}

type SummaryState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly summary: ReportSummary }

type CompletionState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: EvaluationCompletion }

type ScheduleState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly schedules: readonly ReportSchedule[] }

// ─────────────────────────────────────────────────────────────────────────────
// Mock data (API 未実装時のフォールバック)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SUMMARY: ReportSummary = { savedCount: 12, scheduleCount: 4 }

const MOCK_COMPLETION: EvaluationCompletion = {
  period: '2025年度 上半期',
  departments: [
    { departmentName: '開発部', rate: 95 },
    { departmentName: '営業部', rate: 72 },
    { departmentName: '人事部', rate: 88 },
    { departmentName: 'マーケティング部', rate: 60 },
    { departmentName: '経理部', rate: 100 },
    { departmentName: 'カスタマーサポート', rate: 78 },
  ],
}

const MOCK_SCHEDULES: readonly ReportSchedule[] = [
  {
    id: '1',
    name: '月次評価サマリ',
    recipients: ['hr@example.com', 'ceo@example.com'],
    frequency: 'monthly',
    nextDeliveryAt: '2026-05-01T09:00:00',
  },
  {
    id: '2',
    name: '週次スキル分布レポート',
    recipients: ['manager@example.com'],
    frequency: 'weekly',
    nextDeliveryAt: '2026-04-28T08:00:00',
  },
  {
    id: '3',
    name: '目標進捗レポート',
    recipients: ['team-lead@example.com'],
    frequency: 'monthly',
    nextDeliveryAt: '2026-05-01T10:00:00',
  },
  {
    id: '4',
    name: '離職リスクアラート',
    recipients: ['hr@example.com'],
    frequency: 'weekly',
    nextDeliveryAt: '2026-04-25T09:00:00',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Report type card definitions
// ─────────────────────────────────────────────────────────────────────────────

interface ReportTypeCard {
  readonly title: string
  readonly subtitle: string
  readonly icon: string
  readonly accent: string
  readonly iconBg: string
}

const REPORT_TYPES: readonly ReportTypeCard[] = [
  {
    title: '評価サマリ',
    subtitle: '完了率・分布・偏差',
    icon: '📊',
    accent: 'border-indigo-200 hover:border-indigo-400',
    iconBg: 'bg-indigo-50',
  },
  {
    title: '目標達成レポート',
    subtitle: 'OKR / MBO 別',
    icon: '🎯',
    accent: 'border-emerald-200 hover:border-emerald-400',
    iconBg: 'bg-emerald-50',
  },
  {
    title: 'スキル分布',
    subtitle: '部署×カテゴリ',
    icon: '🧩',
    accent: 'border-violet-200 hover:border-violet-400',
    iconBg: 'bg-violet-50',
  },
  {
    title: '離職リスク',
    subtitle: 'AI 予測',
    icon: '⚠️',
    accent: 'border-amber-200 hover:border-amber-400',
    iconBg: 'bg-amber-50',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
    if (!res.ok || !envelope.data) return null
    return envelope.data
  } catch {
    return null
  }
}

function barColor(rate: number): string {
  if (rate === 100) return 'bg-emerald-500'
  if (rate >= 80) return 'bg-indigo-600'
  return 'bg-amber-500'
}

function barLabel(rate: number): string {
  if (rate === 100) return '完了'
  if (rate >= 80) return '達成'
  return '要注意'
}

function barLabelColor(rate: number): string {
  if (rate === 100) return 'text-emerald-700'
  if (rate >= 80) return 'text-indigo-700'
  return 'text-amber-700'
}

function frequencyLabel(freq: ReportSchedule['frequency']): string {
  if (freq === 'daily') return '毎日'
  if (freq === 'weekly') return '毎週'
  return '毎月'
}

function frequencyColor(freq: ReportSchedule['frequency']): string {
  if (freq === 'daily') return 'bg-rose-100 text-rose-700'
  if (freq === 'weekly') return 'bg-indigo-100 text-indigo-700'
  return 'bg-emerald-100 text-emerald-700'
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportsPage(): ReactElement {
  const [summaryState, setSummaryState] = useState<SummaryState>({ kind: 'loading' })
  const [completionState, setCompletionState] = useState<CompletionState>({ kind: 'loading' })
  const [scheduleState, setScheduleState] = useState<ScheduleState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const summary = await fetchJson<ReportSummary>('/api/reports/summary')
      if (!cancelled) {
        setSummaryState({ kind: 'ready', summary: summary ?? MOCK_SUMMARY })
      }

      const completion = await fetchJson<EvaluationCompletion>(
        '/api/reports/evaluation-completion',
      )
      if (!cancelled) {
        setCompletionState({ kind: 'ready', data: completion ?? MOCK_COMPLETION })
      }

      const schedules = await fetchJson<ReportSchedule[]>('/api/reports/schedules')
      if (!cancelled) {
        setScheduleState({
          kind: 'ready',
          schedules: Array.isArray(schedules) ? schedules : MOCK_SCHEDULES,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const savedCount =
    summaryState.kind === 'ready' ? summaryState.summary.savedCount : MOCK_SUMMARY.savedCount
  const scheduleCount =
    summaryState.kind === 'ready' ? summaryState.summary.scheduleCount : MOCK_SUMMARY.scheduleCount

  return (
    <main className="mx-auto max-w-7xl px-8 py-10">
      {/* Header */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
            Reports
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">レポート</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            保存済み{' '}
            <span className="font-semibold text-slate-900 tabular-nums">{savedCount}</span>{' '}
            件・定期配信{' '}
            <span className="font-semibold text-slate-900 tabular-nums">{scheduleCount}</span> 件
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            定期配信
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            ＋ レポート作成
          </button>
        </div>
      </header>

      {/* Report Type Cards */}
      <section className="mb-8">
        <p className="mb-4 text-sm font-semibold text-slate-700">レポートタイプ</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_TYPES.map((card) => (
            <ReportTypeCardView key={card.title} card={card} />
          ))}
        </div>
      </section>

      {/* Evaluation Completion Chart */}
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CompletionChartPanel state={completionState} />
      </section>

      {/* Schedule List */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SchedulePanel state={scheduleState} />
      </section>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportTypeCardView
// ─────────────────────────────────────────────────────────────────────────────

function ReportTypeCardView({ card }: { readonly card: ReportTypeCard }): ReactElement {
  return (
    <button
      type="button"
      className={`group flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${card.accent}`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${card.iconBg}`}
      >
        {card.icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="font-semibold text-slate-900">{card.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{card.subtitle}</p>
      </div>
      <span className="ml-auto shrink-0 text-slate-300 transition-colors group-hover:text-slate-500">
        →
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CompletionChartPanel
// ─────────────────────────────────────────────────────────────────────────────

function CompletionChartPanel({ state }: { readonly state: CompletionState }): ReactElement {
  const period = state.kind === 'ready' ? state.data.period : MOCK_COMPLETION.period

  return (
    <div>
      {/* Panel header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <p className="font-semibold text-slate-900">
          評価完了率 — 部署別（{period}）
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            期間フィルタ ▾
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            PDF 出力
          </button>
        </div>
      </div>

      {/* Chart body */}
      <div className="p-6">
        {state.kind === 'loading' && (
          <div className="flex items-center justify-center py-12 text-sm text-slate-400">
            <span className="animate-pulse">読み込み中…</span>
          </div>
        )}
        {state.kind === 'error' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {state.message}
          </div>
        )}
        {state.kind === 'ready' && (
          <div className="space-y-3">
            {state.data.departments.map((dept) => (
              <CompletionBar key={dept.departmentName} dept={dept} />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-indigo-600" />
            達成
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-amber-500" />
            {'要注意（< 80%）'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
            完了
          </span>
        </div>
      </div>
    </div>
  )
}

function CompletionBar({ dept }: { readonly dept: DeptCompletion }): ReactElement {
  return (
    <div className="flex items-center gap-3">
      {/* Department name */}
      <p className="w-36 shrink-0 truncate text-right text-xs text-slate-600">
        {dept.departmentName}
      </p>

      {/* Bar track */}
      <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barColor(dept.rate)}`}
          style={{ width: `${dept.rate}%` }}
        />
      </div>

      {/* Rate + label */}
      <div className="flex w-20 shrink-0 items-center gap-1.5">
        <span className="tabular-nums text-sm font-semibold text-slate-900">{dept.rate}%</span>
        <span className={`text-xs font-medium ${barLabelColor(dept.rate)}`}>
          {barLabel(dept.rate)}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SchedulePanel
// ─────────────────────────────────────────────────────────────────────────────

function SchedulePanel({ state }: { readonly state: ScheduleState }): ReactElement {
  return (
    <div>
      <div className="border-b border-slate-200 px-6 py-4">
        <p className="font-semibold text-slate-900">定期配信レポート</p>
      </div>

      {state.kind === 'loading' && (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {state.message}
        </div>
      )}

      {state.kind === 'ready' && state.schedules.length === 0 && (
        <div className="py-16 text-center text-sm text-slate-400">
          定期配信レポートが登録されていません
        </div>
      )}

      {state.kind === 'ready' && state.schedules.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-3 text-left">レポート名</th>
                <th className="px-6 py-3 text-left">配信先</th>
                <th className="px-6 py-3 text-left">頻度</th>
                <th className="px-6 py-3 text-left">次回配信</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.schedules.map((schedule) => (
                <ScheduleRow key={schedule.id} schedule={schedule} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ScheduleRow({ schedule }: { readonly schedule: ReportSchedule }): ReactElement {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-6 py-4 font-medium text-slate-900">{schedule.name}</td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-1">
          {schedule.recipients.map((r) => (
            <span
              key={r}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              {r}
            </span>
          ))}
        </div>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${frequencyColor(schedule.frequency)}`}
        >
          {frequencyLabel(schedule.frequency)}
        </span>
      </td>
      <td className="px-6 py-4 tabular-nums text-slate-700">
        {formatDateTime(schedule.nextDeliveryAt)}
      </td>
      <td className="px-6 py-4 text-right">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          編集
        </button>
      </td>
    </tr>
  )
}
