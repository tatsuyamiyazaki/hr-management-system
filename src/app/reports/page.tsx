'use client'

import { useCallback, useEffect, useState, type ChangeEvent, type ReactElement } from 'react'
import { REPORT_CARDS } from '@/lib/reports/report-data'
import type {
  DepartmentCompletion,
  FrequencyType,
  ReportInsight,
  ReportSchedule,
  ReportType,
} from '@/lib/reports/report-types'

type ReportState =
  | { kind: 'loading' }
  | {
      kind: 'ready'
      selectedReport: ReportType
      chartData: readonly DepartmentCompletion[]
      schedules: readonly ReportSchedule[]
    }
  | { kind: 'error'; message: string }

interface EvaluationSummaryPayload {
  readonly chartData?: readonly DepartmentCompletion[]
}

interface SchedulesPayload {
  readonly schedules?: readonly ReportSchedule[]
}

const PERIODS = [
  { value: '2026-Q1', label: '2026 Q1' },
  { value: '2025-Q4', label: '2025 Q4' },
  { value: '2025-Q3', label: '2025 Q3' },
] as const

const EMPTY_INSIGHT: ReportInsight = {
  reportType: 'GOAL_ACHIEVEMENT',
  title: '',
  metrics: [],
}

const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  WEEKLY: '毎週',
  MONTHLY: '毎月',
  QUARTERLY: '四半期',
}

const CARD_ACCENTS: Record<ReportType, string> = {
  EVALUATION_SUMMARY: 'border-indigo-200 bg-indigo-50/40',
  GOAL_ACHIEVEMENT: 'border-emerald-200 bg-emerald-50/40',
  SKILL_DISTRIBUTION: 'border-cyan-200 bg-cyan-50/40',
  ATTRITION_RISK: 'border-rose-200 bg-rose-50/40',
}

const REPORT_API: Record<Exclude<ReportType, 'EVALUATION_SUMMARY'>, string> = {
  GOAL_ACHIEVEMENT: '/api/reports/goal-achievement',
  SKILL_DISTRIBUTION: '/api/reports/skill-distribution',
  ATTRITION_RISK: '/api/reports/attrition-risk',
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : 'レポートデータの取得に失敗しました'
}

function completionColor(status: DepartmentCompletion['status']): string {
  if (status === 'DONE') return 'bg-indigo-600'
  if (status === 'COMPLETE') return 'bg-emerald-500'
  return 'bg-orange-500'
}

function statusLabel(status: DepartmentCompletion['status']): string {
  if (status === 'DONE') return '完了済'
  if (status === 'COMPLETE') return '完了'
  return '要注意'
}

function buildExportUrl(type: ReportType): string {
  const params = new URLSearchParams({ type, format: 'pdf' })
  return `/api/reports/export?${params.toString()}`
}

export default function ReportsPage(): ReactElement {
  const [state, setState] = useState<ReportState>({ kind: 'loading' })
  const [selectedReport, setSelectedReport] = useState<ReportType>('EVALUATION_SUMMARY')
  const [period, setPeriod] = useState('2026-Q1')
  const [insight, setInsight] = useState<ReportInsight>(EMPTY_INSIGHT)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setState({ kind: 'loading' })
      try {
        const [summaryResponse, schedulesResponse] = await Promise.all([
          fetch(`/api/reports/evaluation-summary?period=${encodeURIComponent(period)}`, {
            cache: 'no-store',
          }),
          fetch('/api/reports/schedules', { cache: 'no-store' }),
        ])
        const summaryPayload = (await summaryResponse.json().catch(() => ({}))) as
          | EvaluationSummaryPayload
          | undefined
        const schedulesPayload = (await schedulesResponse.json().catch(() => ({}))) as
          | SchedulesPayload
          | undefined

        if (!summaryResponse.ok) throw new Error(`HTTP ${summaryResponse.status}`)
        if (!schedulesResponse.ok) throw new Error(`HTTP ${schedulesResponse.status}`)

        if (!cancelled) {
          setState({
            kind: 'ready',
            selectedReport,
            chartData: summaryPayload?.chartData ?? [],
            schedules: schedulesPayload?.schedules ?? [],
          })
        }
      } catch (error) {
        if (!cancelled) setState({ kind: 'error', message: readError(error) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [period, selectedReport])

  useEffect(() => {
    if (selectedReport === 'EVALUATION_SUMMARY') return
    let cancelled = false

    void (async () => {
      const endpoint = REPORT_API[selectedReport]
      const url =
        selectedReport === 'GOAL_ACHIEVEMENT'
          ? `${endpoint}?period=${encodeURIComponent(period)}`
          : endpoint
      const response = await fetch(url, { cache: 'no-store' })
      const payload = (await response.json().catch(() => EMPTY_INSIGHT)) as ReportInsight
      if (!cancelled && response.ok) setInsight(payload)
    })()

    return () => {
      cancelled = true
    }
  }, [period, selectedReport])

  const schedules = state.kind === 'ready' ? state.schedules : []
  const chartData = state.kind === 'ready' ? state.chartData : []

  const handlePeriodChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setPeriod(event.target.value)
  }, [])

  const handleEditSchedule = useCallback(async (schedule: ReportSchedule) => {
    setEditingScheduleId(schedule.id)
    await fetch(`/api/reports/schedules/${schedule.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nextDelivery: schedule.nextDelivery }),
    })
    setEditingScheduleId(null)
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-600">Reports</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">レポート</h1>
          </div>
          <a
            href={buildExportUrl(selectedReport)}
            className="inline-flex h-10 w-fit items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            PDFダウンロード
          </a>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {REPORT_CARDS.map((card) => (
            <button
              key={card.type}
              type="button"
              onClick={() => setSelectedReport(card.type)}
              className={`flex min-h-40 flex-col justify-between rounded-lg border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                selectedReport === card.type
                  ? `${CARD_ACCENTS[card.type]} ring-2 ring-indigo-200`
                  : 'border-slate-200'
              }`}
            >
              <span>
                <span className="text-lg font-semibold text-slate-950">{card.title}</span>
                <span className="mt-2 block text-sm leading-6 text-slate-600">
                  {card.description}
                </span>
              </span>
              <span className="mt-5 inline-flex h-9 w-fit items-center rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white">
                レポートを見る
              </span>
            </button>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {selectedReport === 'EVALUATION_SUMMARY' ? '評価完了率' : insight.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedReport === 'EVALUATION_SUMMARY'
                  ? '部署別に評価提出の進捗を確認します'
                  : '選択したレポートの主要指標です'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={period}
                onChange={handlePeriodChange}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                aria-label="期間フィルタ"
              >
                {PERIODS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <a
                href={buildExportUrl(selectedReport)}
                className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                PDFダウンロード
              </a>
            </div>
          </div>

          <div className="p-5">
            {state.kind === 'loading' && (
              <div className="py-16 text-center text-sm text-slate-500">読み込み中...</div>
            )}
            {state.kind === 'error' && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {state.message}
              </div>
            )}
            {state.kind === 'ready' && selectedReport === 'EVALUATION_SUMMARY' && (
              <CompletionChart rows={chartData} />
            )}
            {state.kind === 'ready' && selectedReport !== 'EVALUATION_SUMMARY' && (
              <InsightPanel insight={insight} />
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold">定期配信レポート</h2>
          </div>
          <ScheduleTable
            schedules={schedules}
            editingScheduleId={editingScheduleId}
            onEdit={handleEditSchedule}
          />
        </section>
      </div>
    </main>
  )
}

function CompletionChart({
  rows,
}: {
  readonly rows: readonly DepartmentCompletion[]
}): ReactElement {
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.departmentName} className="grid gap-2 sm:grid-cols-[160px_1fr_96px]">
          <p className="text-sm font-medium text-slate-700 sm:text-right">{row.departmentName}</p>
          <div className="h-8 overflow-hidden rounded-md bg-slate-100">
            <div
              className={`flex h-full items-center justify-end rounded-md px-3 text-xs font-semibold text-white ${completionColor(row.status)}`}
              style={{ width: `${row.completionRate}%` }}
            >
              {row.completionRate}%
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700">{statusLabel(row.status)}</p>
        </div>
      ))}
      <div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-500">
        <LegendItem color="bg-emerald-500" label="完了 80%以上" />
        <LegendItem color="bg-orange-500" label="要注意 80%未満" />
        <LegendItem color="bg-indigo-600" label="完了済 100%" />
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { readonly color: string; readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  )
}

function InsightPanel({ insight }: { readonly insight: ReportInsight }): ReactElement {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {insight.metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
        </div>
      ))}
    </div>
  )
}

interface ScheduleTableProps {
  readonly schedules: readonly ReportSchedule[]
  readonly editingScheduleId: string | null
  readonly onEdit: (schedule: ReportSchedule) => void
}

function ScheduleTable({ schedules, editingScheduleId, onEdit }: ScheduleTableProps): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-5 py-3">レポート名</th>
            <th className="px-5 py-3">配信先</th>
            <th className="px-5 py-3">頻度</th>
            <th className="px-5 py-3">次回配信</th>
            <th className="w-16 px-5 py-3 text-right">-</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {schedules.map((schedule) => (
            <tr key={schedule.id} className="hover:bg-slate-50">
              <td className="px-5 py-4 font-medium text-slate-900">{schedule.reportName}</td>
              <td className="px-5 py-4 text-slate-600">{schedule.recipients}</td>
              <td className="px-5 py-4">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {FREQUENCY_LABELS[schedule.frequency]}
                </span>
              </td>
              <td className="px-5 py-4 font-mono text-xs text-slate-600">
                {schedule.nextDelivery}
              </td>
              <td className="px-5 py-4 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(schedule)}
                  disabled={editingScheduleId === schedule.id}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  aria-label={`${schedule.reportName}を編集`}
                  title="編集"
                >
                  ✎
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
