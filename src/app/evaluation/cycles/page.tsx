/**
 * Issue #202: 360度評価画面リデザイン
 *
 * - KPI カード 3 枚（提出済み / 最低評価者数未達 / AI品質ゲート通過率）
 * - タブナビゲーション（全体進捗 / 評価者別 / 被評価者別 / 異議申立て）
 * - 被評価者別進捗テーブル（ステータスバッジ・プログレスバー）
 * - API 未実装時はモックデータにフォールバック
 *
 * GET /api/evaluation/cycles              — サイクル一覧
 * GET /api/evaluation/cycles/{id}/progress — 被評価者別進捗
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

interface CycleSummary {
  readonly id: string
  readonly name: string
  readonly startDate: string // ISO date
  readonly endDate: string
  readonly minReviewers: number
  readonly submittedCount: number
  readonly totalCount: number
  readonly undertakenCount: number
  readonly aiPassRate: number // 0–100
  readonly aiAvgTurns: number
  readonly aiPassRateDiff: number // 前期差 pt
}

type EvaluateeStatus =
  | 'completed'
  | 'in_progress'
  | 'deadline_near'
  | 'insufficient_stats'
  | 'mild_converted'

interface EvaluateeRow {
  readonly id: string
  readonly name: string
  readonly employeeNumber: string
  readonly department: string
  readonly role: string
  readonly evaluatorDone: number
  readonly evaluatorTotal: number
  readonly progressPercent: number
  readonly status: EvaluateeStatus
}

type ActiveTab = 'overall' | 'by-evaluator' | 'by-evaluatee' | 'appeals'

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly cycle: CycleSummary; readonly rows: readonly EvaluateeRow[] }

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_CYCLE: CycleSummary = {
  id: 'cycle-2026-h1',
  name: '2026年度上期',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  minReviewers: 3,
  submittedCount: 142,
  totalCount: 180,
  undertakenCount: 8,
  aiPassRate: 91,
  aiAvgTurns: 2.3,
  aiPassRateDiff: 4,
}

const MOCK_ROWS: readonly EvaluateeRow[] = [
  {
    id: 'ev-001',
    name: '田中 一郎',
    employeeNumber: 'emp-00123',
    department: '開発部',
    role: 'シニアエンジニア',
    evaluatorDone: 4,
    evaluatorTotal: 4,
    progressPercent: 100,
    status: 'completed',
  },
  {
    id: 'ev-002',
    name: '鈴木 花子',
    employeeNumber: 'emp-00256',
    department: '営業部',
    role: 'セールスマネージャー',
    evaluatorDone: 3,
    evaluatorTotal: 4,
    progressPercent: 75,
    status: 'in_progress',
  },
  {
    id: 'ev-003',
    name: '佐藤 次郎',
    employeeNumber: 'emp-00387',
    department: '人事部',
    role: 'HRビジネスパートナー',
    evaluatorDone: 2,
    evaluatorTotal: 4,
    progressPercent: 50,
    status: 'deadline_near',
  },
  {
    id: 'ev-004',
    name: '山田 美咲',
    employeeNumber: 'emp-00512',
    department: 'マーケティング部',
    role: 'プロダクトマネージャー',
    evaluatorDone: 1,
    evaluatorTotal: 4,
    progressPercent: 25,
    status: 'insufficient_stats',
  },
  {
    id: 'ev-005',
    name: '伊藤 健',
    employeeNumber: 'emp-00634',
    department: '経理部',
    role: 'ファイナンスアナリスト',
    evaluatorDone: 3,
    evaluatorTotal: 4,
    progressPercent: 75,
    status: 'mild_converted',
  },
  {
    id: 'ev-006',
    name: '渡辺 さくら',
    employeeNumber: 'emp-00741',
    department: '開発部',
    role: 'フロントエンドエンジニア',
    evaluatorDone: 4,
    evaluatorTotal: 4,
    progressPercent: 100,
    status: 'completed',
  },
  {
    id: 'ev-007',
    name: '中村 拓哉',
    employeeNumber: 'emp-00855',
    department: 'カスタマーサポート',
    role: 'サポートスペシャリスト',
    evaluatorDone: 2,
    evaluatorTotal: 4,
    progressPercent: 50,
    status: 'in_progress',
  },
  {
    id: 'ev-008',
    name: '小林 陽子',
    employeeNumber: 'emp-00962',
    department: '営業部',
    role: 'アカウントエグゼクティブ',
    evaluatorDone: 0,
    evaluatorTotal: 3,
    progressPercent: 0,
    status: 'insufficient_stats',
  },
]

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

function daysRemaining(endDate: string): number {
  const end = new Date(endDate)
  const now = new Date()
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function submissionRate(done: number, total: number): number {
  if (total === 0) return 0
  return Math.round((done / total) * 100)
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`
  }
  return name.charAt(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<EvaluateeStatus, string> = {
  completed: '完了',
  in_progress: '進行中',
  deadline_near: '期限近',
  insufficient_stats: '統計的有意性不足',
  mild_converted: 'マイルド化済',
}

const STATUS_CLASS: Record<EvaluateeStatus, string> = {
  completed: 'bg-indigo-700 text-white',
  in_progress: 'bg-blue-100 text-blue-700',
  deadline_near: 'bg-amber-100 text-amber-700',
  insufficient_stats: 'bg-rose-100 text-rose-700',
  mild_converted: 'bg-violet-100 text-violet-700',
}

function progressBarColor(status: EvaluateeStatus, pct: number): string {
  if (status === 'insufficient_stats') return 'bg-rose-500'
  if (pct === 100) return 'bg-indigo-700'
  if (pct >= 67) return 'bg-indigo-500'
  return 'bg-amber-500'
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab config
// ─────────────────────────────────────────────────────────────────────────────

const TABS: ReadonlyArray<{ readonly id: ActiveTab; readonly label: string }> = [
  { id: 'overall', label: '全体進捗' },
  { id: 'by-evaluator', label: '評価者別' },
  { id: 'by-evaluatee', label: '被評価者別' },
  { id: 'appeals', label: '異議申立て' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CyclesPage(): ReactElement {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [activeTab, setActiveTab] = useState<ActiveTab>('overall')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cycles = await fetchJson<CycleSummary[]>('/api/evaluation/cycles')
        const activeCycle =
          Array.isArray(cycles) && cycles.length > 0 && cycles[0] ? cycles[0] : MOCK_CYCLE

        const rows = await fetchJson<EvaluateeRow[]>(
          `/api/evaluation/cycles/${activeCycle.id}/progress`,
        )
        if (cancelled) return
        setState({
          kind: 'ready',
          cycle: activeCycle,
          rows: Array.isArray(rows) ? rows : MOCK_ROWS,
        })
      } catch (err) {
        if (cancelled) return
        setState({ kind: 'error', message: readError(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'loading') {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <PageShell cycleName="360度評価" />
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 text-sm text-slate-500">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <PageShell cycleName="360度評価" />
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-semibold">データの取得に失敗しました</p>
          <p className="mt-1 text-xs opacity-80">{state.message}</p>
        </div>
      </main>
    )
  }

  const { cycle, rows } = state
  const daysLeft = daysRemaining(cycle.endDate)
  const rate = submissionRate(cycle.submittedCount, cycle.totalCount)

  return (
    <main className="mx-auto max-w-7xl px-8 py-10">
      {/* Breadcrumb */}
      <p className="mb-4 text-xs text-slate-400">
        ワークスペース / <span className="text-slate-600">360度評価</span>
      </p>

      {/* Page Header */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
            360° Evaluation
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            360度評価 — {cycle.name}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            評価期間: {formatDate(cycle.startDate)} 〜 {formatDate(cycle.endDate)}（残{' '}
            <span
              className={`font-semibold tabular-nums ${daysLeft <= 7 ? 'text-rose-600' : 'text-slate-900'}`}
            >
              {daysLeft}
            </span>{' '}
            日）・最低評価者数{' '}
            <span className="font-semibold text-slate-900 tabular-nums">{cycle.minReviewers}</span>{' '}
            名
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            代替評価者を割当
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            サイクルを確定
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <KpiSubmitted submitted={cycle.submittedCount} total={cycle.totalCount} rate={rate} />
        <KpiUndertaken count={cycle.undertakenCount} />
        <KpiAiGate
          passRate={cycle.aiPassRate}
          avgTurns={cycle.aiAvgTurns}
          diff={cycle.aiPassRateDiff}
        />
      </div>

      {/* Tab navigation */}
      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overall' ? (
        <OverallProgressTab rows={rows} />
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 py-20 text-sm text-slate-400">
          このタブは準備中です（Coming soon）
        </div>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PageShell (loading / error skeleton)
// ─────────────────────────────────────────────────────────────────────────────

function PageShell({ cycleName }: { readonly cycleName: string }): ReactElement {
  return (
    <header className="mb-8">
      <p className="mb-1 text-xs text-slate-400">
        ワークスペース / <span className="text-slate-600">360度評価</span>
      </p>
      <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
        360° Evaluation
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{cycleName}</h1>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Cards
// ─────────────────────────────────────────────────────────────────────────────

function KpiSubmitted({
  submitted,
  total,
  rate,
}: {
  readonly submitted: number
  readonly total: number
  readonly rate: number
}): ReactElement {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="absolute right-4 top-4 text-lg" aria-hidden>
        ✅
      </span>
      <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">提出済み</p>
      <p className="mt-2 text-4xl font-bold text-slate-900 tabular-nums">{submitted}</p>
      <p className="mt-1 text-xs text-slate-500">総枚数 {total}</p>
      <p className="mt-2 text-xl font-semibold text-indigo-600 tabular-nums">{rate}%</p>
    </div>
  )
}

function KpiUndertaken({ count }: { readonly count: number }): ReactElement {
  return (
    <div className="relative rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
      <span className="absolute right-4 top-4 text-lg" aria-hidden>
        ⚠️
      </span>
      <p className="text-xs font-semibold tracking-wider text-amber-600 uppercase">
        最低評価者数未達
      </p>
      <p className="mt-2 text-4xl font-bold text-amber-700 tabular-nums">{count}</p>
      <p className="mt-1 text-xs text-amber-600">被評価者のうち</p>
      {count > 0 && (
        <span className="mt-3 inline-flex items-center rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          要対応
        </span>
      )}
    </div>
  )
}

function KpiAiGate({
  passRate,
  avgTurns,
  diff,
}: {
  readonly passRate: number
  readonly avgTurns: number
  readonly diff: number
}): ReactElement {
  const diffPositive = diff >= 0
  return (
    <div className="relative rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
      <span className="absolute right-4 top-4 text-lg" aria-hidden>
        ✨
      </span>
      <p className="text-xs font-semibold tracking-wider text-indigo-500 uppercase">
        AI品質ゲート通過率
      </p>
      <p className="mt-2 text-4xl font-bold text-indigo-700 tabular-nums">{passRate}%</p>
      <p className="mt-1 text-xs text-indigo-500">平均 {avgTurns} ターン</p>
      <p className={`mt-1 text-sm font-semibold ${diffPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
        {diffPositive ? `↑ ${diff}pt` : `↓ ${Math.abs(diff)}pt`}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OverallProgressTab
// ─────────────────────────────────────────────────────────────────────────────

function OverallProgressTab({ rows }: { readonly rows: readonly EvaluateeRow[] }): ReactElement {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <p className="font-semibold text-slate-900">被評価者別進捗</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            フィルタ ▾
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            CSV ↓
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">データがありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-3 text-left">被評価者</th>
                <th className="px-6 py-3 text-left">部署 / 役職</th>
                <th className="px-6 py-3 text-left">評価者</th>
                <th className="px-6 py-3 text-left">進捗</th>
                <th className="px-6 py-3 text-left">ステータス</th>
                <th className="px-6 py-3 text-right">詳細</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <EvaluateeTableRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EvaluateeTableRow({ row }: { readonly row: EvaluateeRow }): ReactElement {
  return (
    <tr className="hover:bg-slate-50">
      {/* 被評価者 */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(row.id)}`}
          >
            {getInitials(row.name)}
          </div>
          <div>
            <p className="font-medium text-slate-900">{row.name}</p>
            <p className="font-mono text-[10px] text-slate-400">{row.employeeNumber}</p>
          </div>
        </div>
      </td>

      {/* 部署 / 役職 */}
      <td className="px-6 py-4">
        <p className="text-slate-800">{row.department}</p>
        <p className="text-xs text-slate-400">{row.role}</p>
      </td>

      {/* 評価者 */}
      <td className="px-6 py-4 tabular-nums text-slate-700">
        {row.evaluatorDone} / {row.evaluatorTotal}
      </td>

      {/* 進捗 */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${progressBarColor(row.status, row.progressPercent)}`}
              style={{ width: `${row.progressPercent}%` }}
            />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-slate-600">
            {row.progressPercent}%
          </span>
        </div>
      </td>

      {/* ステータス */}
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[row.status]}`}
        >
          {STATUS_LABEL[row.status]}
        </span>
      </td>

      {/* 詳細 */}
      <td className="px-6 py-4 text-right">
        <button
          type="button"
          className="text-sm text-slate-400 hover:text-indigo-600"
          aria-label={`${row.name}の詳細を見る`}
        >
          ›
        </button>
      </td>
    </tr>
  )
}
