'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { Appeal, AppealsKpi, AppealType } from '@/lib/evaluation/appeal-types'

type AppealsState =
  | { kind: 'loading' }
  | { kind: 'ready'; appeals: readonly Appeal[]; kpi: AppealsKpi }
  | { kind: 'error'; message: string }

type AppealAction = 'request-info' | 'reject' | 'correct'

interface AppealsPayload {
  readonly appeals?: readonly Appeal[]
}

interface KpiPayload {
  readonly kpi?: AppealsKpi
}

const TYPE_LABELS: Record<AppealType, string> = {
  EVALUATION_RESULT: '評価結果への異議',
  FEEDBACK: 'フィードバックへの異議',
  CALIBRATION: 'キャリブレーションへの異議',
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : '異議申立てデータの取得に失敗しました'
}

function deadlineClass(days: number): string {
  if (days <= 2) return 'bg-red-100 text-red-700 ring-red-200'
  if (days <= 5) return 'bg-orange-100 text-orange-700 ring-orange-200'
  return 'bg-gray-100 text-gray-600 ring-gray-200'
}

function deadlineLabel(days: number): string {
  if (days <= 2) return `赤 ${days}日以内`
  if (days <= 5) return `橙 ${days}日`
  return `黒 ${days}日以上`
}

function initials(name: string): string {
  const [lastName = '', firstName = ''] = name.split(' ')
  return `${lastName.charAt(0)}${firstName.charAt(0) || ''}`
}

function actionEndpoint(action: AppealAction): string {
  if (action === 'request-info') return 'request-info'
  if (action === 'reject') return 'reject'
  return 'correct'
}

export default function AppealsPage(): ReactElement {
  const [state, setState] = useState<AppealsState>({ kind: 'loading' })
  const [busyAppealId, setBusyAppealId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const [appealsResponse, kpiResponse] = await Promise.all([
        fetch('/api/evaluation/appeals?status=UNDER_REVIEW', { cache: 'no-store' }),
        fetch('/api/evaluation/appeals/kpi', { cache: 'no-store' }),
      ])
      const appealsPayload = (await appealsResponse.json().catch(() => ({}))) as AppealsPayload
      const kpiPayload = (await kpiResponse.json().catch(() => ({}))) as KpiPayload

      if (!appealsResponse.ok) throw new Error(`HTTP ${appealsResponse.status}`)
      if (!kpiResponse.ok) throw new Error(`HTTP ${kpiResponse.status}`)
      if (!kpiPayload.kpi) throw new Error('KPI payload is empty')

      setState({
        kind: 'ready',
        appeals: appealsPayload.appeals ?? [],
        kpi: kpiPayload.kpi,
      })
    } catch (error) {
      setState({ kind: 'error', message: readError(error) })
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleAction = useCallback(async (appealId: string, action: AppealAction) => {
    setBusyAppealId(appealId)
    try {
      const response = await fetch(
        `/api/evaluation/appeals/${appealId}/${actionEndpoint(action)}`,
        { method: 'POST' },
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState((current) => {
        if (current.kind !== 'ready') return current
        return {
          ...current,
          appeals: current.appeals.filter((appeal) => appeal.id !== appealId),
        }
      })
    } catch (error) {
      setState({ kind: 'error', message: readError(error) })
    } finally {
      setBusyAppealId(null)
    }
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-sm font-semibold text-indigo-600">Appeal Review</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">異議申立て審査</h1>
        </header>

        {state.kind === 'loading' && (
          <div className="rounded-lg border border-slate-200 bg-white py-20 text-center text-sm text-slate-500">
            読み込み中...
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            {state.message}
          </div>
        )}

        {state.kind === 'ready' && (
          <>
            <section className="mb-8 grid gap-4 md:grid-cols-3">
              <KpiCard
                title="審査中"
                value={`${state.kpi.underReview}件`}
                detail={`平均 ${state.kpi.avgDays.toFixed(1)}日 / 赤 ${state.kpi.nearDeadlineCount}件 期限近`}
                tone="red"
              />
              <KpiCard
                title="今月完了"
                value={`${state.kpi.monthlyCompleted}件`}
                detail={`是正 ${state.kpi.monthlyCorrected} / 却下 ${state.kpi.monthlyRejected} / 平均 5.1日`}
                tone="slate"
              />
              <KpiCard
                title="是正率"
                value={`${state.kpi.correctionRate.toFixed(1)}%`}
                detail={`昨期 38.9% / +${state.kpi.correctionRateDelta.toFixed(1)}pt`}
                tone="emerald"
              />
            </section>

            <section className="space-y-4">
              {state.appeals.map((appeal) => (
                <AppealCard
                  key={appeal.id}
                  appeal={appeal}
                  busy={busyAppealId === appeal.id}
                  onAction={handleAction}
                />
              ))}
              {state.appeals.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
                  審査中の申立てはありません
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

interface KpiCardProps {
  readonly title: string
  readonly value: string
  readonly detail: string
  readonly tone: 'red' | 'slate' | 'emerald'
}

function KpiCard({ title, value, detail, tone }: KpiCardProps): ReactElement {
  const className =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-white text-slate-950'

  return (
    <div className={`rounded-lg border p-5 shadow-sm ${className}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-4xl font-semibold tabular-nums">{value}</p>
      <p className="mt-2 text-sm opacity-80">{detail}</p>
    </div>
  )
}

interface AppealCardProps {
  readonly appeal: Appeal
  readonly busy: boolean
  readonly onAction: (appealId: string, action: AppealAction) => void
}

function AppealCard({ appeal, busy, onAction }: AppealCardProps): ReactElement {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-500">
              {appeal.appealNumber}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${deadlineClass(appeal.deadlineDays)}`}
            >
              {deadlineLabel(appeal.deadlineDays)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {TYPE_LABELS[appeal.type]}
            </span>
          </div>

          <h2 className="mt-3 text-lg font-semibold text-slate-950">{appeal.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{appeal.content}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${appeal.avatarColor}`}
            >
              {initials(appeal.employeeName)}
            </span>
            <div>
              <p className="font-semibold text-slate-900">{appeal.employeeName}</p>
              <p className="text-xs text-slate-500">
                {appeal.employeeNumber} / 提出日 {appeal.submittedAt}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 lg:w-96">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(appeal.id, 'request-info')}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            補足を依頼
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(appeal.id, 'reject')}
            className="h-10 rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            却下
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(appeal.id, 'correct')}
            className="h-10 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            是正に進む
          </button>
        </div>
      </div>
    </article>
  )
}
