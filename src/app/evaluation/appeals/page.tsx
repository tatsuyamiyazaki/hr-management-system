/**
 * Issue #201: 異議申立て画面リデザイン
 *
 * - KPI カード 3 枚（審査中 / 今月完了 / 是正率）
 * - 優先度順の申告カードリスト（期限バッジ・アクションボタン）
 * - API 未実装時はモックデータにフォールバック
 *
 * GET  /api/evaluation/appeals
 * POST /api/evaluation/appeals/{id}/request-supplement
 * POST /api/evaluation/appeals/{id}/reject
 * POST /api/evaluation/appeals/{id}/proceed
 */
'use client'

import { useEffect, useState, useCallback, type ReactElement } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

interface UnderReviewStats {
  readonly count: number
  readonly avgDays: number
  readonly nearDeadlineCount: number
}

interface ThisMonthStats {
  readonly count: number
  readonly correctedCount: number
  readonly rejectedCount: number
  readonly avgDays: number
}

interface CorrectionRateStats {
  readonly percent: number
  readonly lastPeriodPercent: number
  readonly diffPt: number
}

interface AppealSummary {
  readonly pendingCount: number
  readonly urgentCount: number
  readonly underReview: UnderReviewStats
  readonly thisMonth: ThisMonthStats
  readonly correctionRate: CorrectionRateStats
}

interface Appeal {
  readonly id: string
  readonly appealNo: string
  readonly deadlineDaysLeft: number
  readonly appealType: string
  readonly title: string
  readonly content: string
  readonly submitterName: string
  readonly submitterEmployeeNo: string
  readonly submittedAt: string // ISO 8601
}

interface AppealsData {
  readonly summary: AppealSummary
  readonly appeals: readonly Appeal[]
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: AppealsData }

type ActionKind = 'supplement' | 'reject' | 'proceed'

// ─────────────────────────────────────────────────────────────────────────────
// Mock data (API 未実装時のフォールバック)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_DATA: AppealsData = {
  summary: {
    pendingCount: 8,
    urgentCount: 3,
    underReview: { count: 5, avgDays: 3.2, nearDeadlineCount: 3 },
    thisMonth: { count: 12, correctedCount: 7, rejectedCount: 5, avgDays: 4.1 },
    correctionRate: { percent: 58, lastPeriodPercent: 52, diffPt: 6 },
  },
  appeals: [
    {
      id: 'ap-001',
      appealNo: 'AP-2025-0042',
      deadlineDaysLeft: 1,
      appealType: '総合評価点への申立て',
      title: 'Q4評価における業績指標の算定誤りについて',
      content:
        '第4四半期の売上目標達成率の計算に誤りがあります。実績は目標の112%でしたが、評価シート上では98%と記載されています。修正をお願いします。',
      submitterName: '田中 一郎',
      submitterEmployeeNo: 'emp-00123',
      submittedAt: '2026-04-20T10:30:00',
    },
    {
      id: 'ap-002',
      appealNo: 'AP-2025-0041',
      deadlineDaysLeft: 3,
      appealType: 'コンピテンシー評価への申立て',
      title: 'リーダーシップ評価の根拠説明を求める申立て',
      content:
        'リーダーシップ項目でC評価を受けましたが、今期はプロジェクトリーダーを3件担当しており、評価根拠の詳細説明を求めます。',
      submitterName: '鈴木 花子',
      submitterEmployeeNo: 'emp-00256',
      submittedAt: '2026-04-19T14:00:00',
    },
    {
      id: 'ap-003',
      appealNo: 'AP-2025-0039',
      deadlineDaysLeft: 5,
      appealType: '目標設定への申立て',
      title: '中途設定された追加目標の評価基準不明確',
      content:
        '10月に追加設定された目標について、達成基準が曖昧なまま評価されました。具体的な数値目標がなかったにもかかわらず、未達成と判断されています。',
      submitterName: '佐藤 次郎',
      submitterEmployeeNo: 'emp-00387',
      submittedAt: '2026-04-18T09:15:00',
    },
    {
      id: 'ap-004',
      appealNo: 'AP-2025-0038',
      deadlineDaysLeft: 8,
      appealType: '総合評価点への申立て',
      title: '育児休業期間中の評価算定方法への異議',
      content:
        '育休取得期間を含む評価において、フル稼働期間と同一基準で評価されており、就業規則第32条に基づく按分計算が適用されていません。',
      submitterName: '山田 美咲',
      submitterEmployeeNo: 'emp-00512',
      submittedAt: '2026-04-17T11:45:00',
    },
    {
      id: 'ap-005',
      appealNo: 'AP-2025-0036',
      deadlineDaysLeft: 12,
      appealType: 'コンピテンシー評価への申立て',
      title: '顧客満足度スコアの集計対象期間の誤り',
      content:
        '顧客満足度の評価対象が1月〜9月のデータのみで算出されており、10〜12月の高評価期間が含まれていません。',
      submitterName: '伊藤 健',
      submitterEmployeeNo: 'emp-00634',
      submittedAt: '2026-04-15T16:00:00',
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

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

async function postAction(url: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<unknown>
    throw new Error(envelope.error ?? `HTTP ${res.status}`)
  }
}

function deadlineBadgeClass(days: number): string {
  if (days <= 2) return 'bg-rose-100 text-rose-700 border-rose-200'
  if (days <= 5) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`
  }
  return name.charAt(0)
}

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-500',
] as const

function avatarColor(id: string): string {
  return AVATAR_COLORS[id.charCodeAt(id.length - 1) % AVATAR_COLORS.length] ?? 'bg-slate-500'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function diffSign(diff: number): string {
  if (diff > 0) return `+${diff}`
  if (diff < 0) return `${diff}`
  return '±0'
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AppealsPage(): ReactElement {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [actionErrors, setActionErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const [actionLoading, setActionLoading] = useState<ReadonlySet<string>>(new Set())

  const loadData = useCallback(async (): Promise<void> => {
    const data = await fetchJson<AppealsData>('/api/evaluation/appeals')
    setState({ kind: 'ready', data: data ?? MOCK_DATA })
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await fetchJson<AppealsData>('/api/evaluation/appeals')
      if (cancelled) return
      setState({ kind: 'ready', data: data ?? MOCK_DATA })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleAction = useCallback(
    async (appealId: string, kind: ActionKind): Promise<void> => {
      const key = `${appealId}-${kind}`
      setActionLoading((prev) => new Set([...prev, key]))
      setActionErrors((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })

      const endpointSuffix =
        kind === 'supplement' ? 'request-supplement' : kind === 'reject' ? 'reject' : 'proceed'

      try {
        await postAction(`/api/evaluation/appeals/${appealId}/${endpointSuffix}`)
        await loadData()
      } catch (err) {
        const msg = readError(err)
        const display =
          msg.includes('404') || msg.includes('501') ? 'この操作は現在実装中です' : msg
        setActionErrors((prev) => new Map([...prev, [key, display]]))
      } finally {
        setActionLoading((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [loadData],
  )

  if (state.kind === 'loading') {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <PageHeader pendingCount={0} urgentCount={0} />
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 text-sm text-slate-500">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <PageHeader pendingCount={0} urgentCount={0} />
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-semibold">データの取得に失敗しました</p>
          <p className="mt-1 text-xs opacity-80">{state.message}</p>
        </div>
      </main>
    )
  }

  const { summary, appeals } = state.data

  return (
    <main className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader pendingCount={summary.pendingCount} urgentCount={summary.urgentCount} />

      {/* KPI Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <KpiUnderReview stats={summary.underReview} />
        <KpiThisMonth stats={summary.thisMonth} />
        <KpiCorrectionRate stats={summary.correctionRate} />
      </div>

      {/* Appeal list */}
      {appeals.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center text-sm text-slate-400">
          審査対象の申立てはありません
        </div>
      ) : (
        <div className="space-y-4">
          {appeals.map((appeal) => (
            <AppealCard
              key={appeal.id}
              appeal={appeal}
              actionLoading={actionLoading}
              actionErrors={actionErrors}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader
// ─────────────────────────────────────────────────────────────────────────────

function PageHeader({
  pendingCount,
  urgentCount,
}: {
  readonly pendingCount: number
  readonly urgentCount: number
}): ReactElement {
  return (
    <header className="mb-8 flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.3em] text-rose-600 uppercase">Appeals</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">異議申立て</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          審査対象{' '}
          <span className="font-semibold text-slate-900 tabular-nums">{pendingCount}</span>{' '}
          件・うち期限3日以内{' '}
          <span className="font-semibold text-rose-600 tabular-nums">{urgentCount}</span> 件
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          絞り込み ▾
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          履歴を出力
        </button>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Cards
// ─────────────────────────────────────────────────────────────────────────────

function KpiUnderReview({ stats }: { readonly stats: UnderReviewStats }): ReactElement {
  return (
    <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-wider text-rose-500 uppercase">審査中</p>
      <p className="mt-2 text-4xl font-bold text-rose-700 tabular-nums">{stats.count}</p>
      <p className="mt-1 text-xs text-rose-500">平均 {stats.avgDays.toFixed(1)} 日</p>
      {stats.nearDeadlineCount > 0 && (
        <span className="mt-3 inline-flex items-center rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
          {stats.nearDeadlineCount}件 期限近
        </span>
      )}
    </div>
  )
}

function KpiThisMonth({ stats }: { readonly stats: ThisMonthStats }): ReactElement {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">今月完了</p>
      <p className="mt-2 text-4xl font-bold text-slate-900 tabular-nums">{stats.count}</p>
      <p className="mt-1 text-xs text-slate-500">
        是正 {stats.correctedCount} / 却下 {stats.rejectedCount} / 平均 {stats.avgDays.toFixed(1)}{' '}
        日
      </p>
    </div>
  )
}

function KpiCorrectionRate({ stats }: { readonly stats: CorrectionRateStats }): ReactElement {
  const diffPositive = stats.diffPt >= 0
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-wider text-emerald-600 uppercase">是正率</p>
      <p className="mt-2 text-4xl font-bold text-emerald-700 tabular-nums">{stats.percent}%</p>
      <p className="mt-1 text-xs text-emerald-600">
        昨期 {stats.lastPeriodPercent}%{' '}
        <span
          className={
            diffPositive ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-600'
          }
        >
          ({diffSign(stats.diffPt)} pt)
        </span>
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AppealCard
// ─────────────────────────────────────────────────────────────────────────────

interface AppealCardProps {
  readonly appeal: Appeal
  readonly actionLoading: ReadonlySet<string>
  readonly actionErrors: ReadonlyMap<string, string>
  readonly onAction: (id: string, kind: ActionKind) => Promise<void>
}

function AppealCard({
  appeal,
  actionLoading,
  actionErrors,
  onAction,
}: AppealCardProps): ReactElement {
  const supplementKey = `${appeal.id}-supplement`
  const rejectKey = `${appeal.id}-reject`
  const proceedKey = `${appeal.id}-proceed`

  const supplementError = actionErrors.get(supplementKey)
  const rejectError = actionErrors.get(rejectKey)
  const proceedError = actionErrors.get(proceedKey)
  const anyError = supplementError ?? rejectError ?? proceedError

  const isSupplementLoading = actionLoading.has(supplementKey)
  const isRejectLoading = actionLoading.has(rejectKey)
  const isProceedLoading = actionLoading.has(proceedKey)
  const anyLoading = isSupplementLoading || isRejectLoading || isProceedLoading

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex gap-6">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Top row: appeal no + deadline badge + type tag */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-slate-400">
              {appeal.appealNo}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${deadlineBadgeClass(appeal.deadlineDaysLeft)}`}
            >
              残 {appeal.deadlineDaysLeft} 日
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
              {appeal.appealType}
            </span>
          </div>

          {/* Title */}
          <h2 className="mb-1.5 text-base font-semibold text-slate-900">{appeal.title}</h2>

          {/* Content */}
          <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-slate-600">
            {appeal.content}
          </p>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={anyLoading}
              onClick={() => void onAction(appeal.id, 'supplement')}
              className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isSupplementLoading ? '送信中…' : '補足を依頼'}
            </button>
            <button
              type="button"
              disabled={anyLoading}
              onClick={() => void onAction(appeal.id, 'reject')}
              className="rounded-lg border border-rose-200 px-3.5 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {isRejectLoading ? '処理中…' : '却下'}
            </button>
            <button
              type="button"
              disabled={anyLoading}
              onClick={() => void onAction(appeal.id, 'proceed')}
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isProceedLoading ? '処理中…' : '是正に進む'}
            </button>
          </div>

          {anyError && <p className="mt-2 text-xs text-rose-600">{anyError}</p>}
        </div>

        {/* Right: submitter info */}
        <div className="flex shrink-0 flex-col items-center gap-1.5 pl-4 text-center">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(appeal.id)}`}
          >
            {getInitials(appeal.submitterName)}
          </div>
          <p className="text-xs font-semibold text-slate-800">{appeal.submitterName}</p>
          <p className="font-mono text-[10px] text-slate-400">{appeal.submitterEmployeeNo}</p>
          <p className="text-[10px] text-slate-400">{formatDate(appeal.submittedAt)}</p>
        </div>
      </div>
    </div>
  )
}
