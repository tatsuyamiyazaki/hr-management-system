'use client'

import { useCallback, useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalStatus = 'pending' | 'in_progress' | 'completed' | 'rejected'

interface Goal {
  readonly id: string
  readonly title: string
  readonly type: 'OKR' | 'MBO'
  readonly weight: number
  readonly status: GoalStatus
  readonly progressPercent: number
  readonly dueDate: string
  readonly completedAt: string | null
  readonly keyResults: readonly string[]
}

interface PendingApproval {
  readonly goalId: string
  readonly approverName: string
  readonly approverRole: string
  readonly notifiedAt: string
  readonly parentGoalName: string
  readonly parentGoalPath: readonly string[]
  readonly aiAdvice: string
  readonly aiModel: string
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly goals: readonly Goal[]; readonly pendingApproval: PendingApproval | null }

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_GOALS: readonly Goal[] = [
  {
    id: 'g1',
    title: '顧客満足度スコアを Q2 末までに 85 点以上に向上させる',
    type: 'OKR',
    weight: 40,
    status: 'pending',
    progressPercent: 0,
    dueDate: '2026-06-30',
    completedAt: null,
    keyResults: [
      'NPS を現状 72 → 85 点に改善',
      'サポート対応時間を平均 24h → 12h に短縮',
      'リピート率を 68% → 78% に向上',
    ],
  },
  {
    id: 'g2',
    title: '新規顧客獲得数を Q1 比 20% 増加させる',
    type: 'MBO',
    weight: 30,
    status: 'in_progress',
    progressPercent: 45,
    dueDate: '2026-06-30',
    completedAt: null,
    keyResults: [],
  },
  {
    id: 'g3',
    title: 'プロダクト知識習得：認定資格を 2 つ取得する',
    type: 'MBO',
    weight: 20,
    status: 'in_progress',
    progressPercent: 60,
    dueDate: '2026-05-31',
    completedAt: null,
    keyResults: [],
  },
  {
    id: 'g4',
    title: 'チームオンボーディングガイドを整備・公開する',
    type: 'OKR',
    weight: 10,
    status: 'completed',
    progressPercent: 100,
    dueDate: '2026-04-15',
    completedAt: '2026-04-12',
    keyResults: [
      'ガイドドキュメント（10 章）を作成・レビュー完了',
      '新入社員 3 名がガイドを使用し評価 4.5/5 を取得',
    ],
  },
]

const MOCK_PENDING: PendingApproval = {
  goalId: 'g1',
  approverName: '田中 誠',
  approverRole: 'マネージャー',
  notifiedAt: '2026-04-22T10:30:00',
  parentGoalName: '2026年度上期 部門 OKR — 顧客体験の抜本的改善',
  parentGoalPath: ['全社目標', '営業部門', '2026上期 OKR'],
  aiAdvice:
    'この目標は部門 OKR との整合性が高く、具体的な KR が設定されています。達成指標は測定可能であり、承認を推奨します。進捗管理のため月次チェックインの設定もご検討ください。',
  aiModel: 'Claude 3.5 Sonnet',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function statusOrder(status: GoalStatus): number {
  const order: Record<GoalStatus, number> = {
    pending: 0,
    in_progress: 1,
    completed: 2,
    rejected: 3,
  }
  return order[status]
}

function statusLabel(status: GoalStatus): string {
  const labels: Record<GoalStatus, string> = {
    pending: '承認待ち',
    in_progress: '進行中',
    completed: '完了',
    rejected: '差し戻し',
  }
  return labels[status]
}

function statusBadgeClass(status: GoalStatus): string {
  const classes: Record<GoalStatus, string> = {
    pending: 'bg-amber-100 text-amber-800',
    in_progress: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-rose-100 text-rose-800',
  }
  return classes[status]
}

function progressBarColor(status: GoalStatus): string {
  const colors: Record<GoalStatus, string> = {
    completed: 'bg-emerald-500',
    in_progress: 'bg-indigo-500',
    pending: 'bg-amber-400',
    rejected: 'bg-rose-400',
  }
  return colors[status]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  isHighlighted,
  onClick,
}: {
  readonly goal: Goal
  readonly isHighlighted: boolean
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-5 transition-all ${
        isHighlighted
          ? 'border-indigo-500 ring-2 ring-indigo-200 bg-white shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(goal.status)}`}>
            {statusLabel(goal.status)}
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {goal.type}
          </span>
          <span className="text-xs text-gray-500">ウェイト {goal.weight}%</span>
        </div>
        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{goal.progressPercent}%</span>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-gray-900 leading-snug mb-3">{goal.title}</p>

      {/* Key Results */}
      {goal.keyResults.length > 0 && (
        <ul className="mb-3 space-y-1">
          {goal.keyResults.map((kr, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
              <span className="mt-0.5 text-indigo-400 font-bold">KR{i + 1}</span>
              <span>{kr}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${progressBarColor(goal.status)}`}
          style={{ width: `${goal.progressPercent}%` }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>期日 {formatDate(goal.dueDate)}</span>
        {goal.completedAt && <span className="text-emerald-600">✓ {formatDate(goal.completedAt)} 完了</span>}
      </div>
    </button>
  )
}

// ─── ApprovalPanel ────────────────────────────────────────────────────────────

function ApprovalPanel({
  approval,
  onApprove,
  onReject,
}: {
  readonly approval: PendingApproval
  readonly onApprove: (goalId: string) => void
  readonly onReject: (goalId: string) => void
}) {
  return (
    <aside className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-amber-600 text-lg">🕐</span>
        <h3 className="text-sm font-bold text-amber-900">承認待ち</h3>
      </div>

      {/* Approver block */}
      <div className="bg-white rounded-lg border border-amber-100 p-4">
        <p className="text-xs text-gray-500 mb-1">承認者</p>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
            {approval.approverName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{approval.approverName}</p>
            <p className="text-xs text-gray-500">{approval.approverRole}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">申請日時 {formatDate(approval.notifiedAt)}</p>
      </div>

      {/* Parent goal */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-gray-400">🔗</span>
          <p className="text-xs font-medium text-gray-700">紐付き上位目標</p>
        </div>
        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400 mb-2">
          {approval.parentGoalPath.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <span>{seg}</span>
            </span>
          ))}
        </div>
        <p className="text-xs font-medium text-gray-800 bg-white rounded border border-gray-200 px-3 py-2">
          {approval.parentGoalName}
        </p>
      </div>

      {/* AI Advice */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-indigo-500">✨</span>
          <p className="text-xs font-semibold text-indigo-700">AI 承認アドバイス</p>
          <span className="ml-auto text-xs text-indigo-400">{approval.aiModel}</span>
        </div>
        <p className="text-xs text-indigo-900 leading-relaxed">{approval.aiAdvice}</p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => onApprove(approval.goalId)}
          className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          ✓ 承認する
        </button>
        <button
          type="button"
          onClick={() => onReject(approval.goalId)}
          className="w-full py-2.5 rounded-lg border border-rose-300 text-rose-600 text-sm font-semibold hover:bg-rose-50 transition-colors"
        >
          差し戻す
        </button>
      </div>
    </aside>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PersonalGoalsPage() {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>('g1')
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const data = await fetchJson<{ goals: Goal[]; pendingApproval: PendingApproval | null }>(
        '/api/goals/personal'
      )
      if (data) {
        setState({ kind: 'ready', goals: data.goals, pendingApproval: data.pendingApproval })
      } else {
        setState({ kind: 'ready', goals: [...MOCK_GOALS], pendingApproval: MOCK_PENDING })
      }
    }
    void load()
  }, [])

  const handleApprove = useCallback(async (goalId: string) => {
    const res = await fetchJson<{ success: boolean }>(`/api/goals/personal/${goalId}/approve`)
    if (res?.success) {
      setActionMessage('目標を承認しました。')
    } else {
      setActionMessage('現在実装中です。（モック動作）')
    }
  }, [])

  const handleReject = useCallback(async (goalId: string) => {
    const res = await fetchJson<{ success: boolean }>(`/api/goals/personal/${goalId}/reject`)
    if (res?.success) {
      setActionMessage('目標を差し戻しました。')
    } else {
      setActionMessage('現在実装中です。（モック動作）')
    }
  }, [])

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-rose-500 text-sm">{state.message}</p>
      </div>
    )
  }

  const { goals, pendingApproval } = state
  const sortedGoals = [...goals].sort((a, b) => statusOrder(a.status) - statusOrder(b.status))
  const pendingCount = goals.filter((g) => g.status === 'pending').length
  const totalWeight = goals.reduce((sum, g) => sum + g.weight, 0)

  const selectedApproval =
    pendingApproval && selectedGoalId === pendingApproval.goalId ? pendingApproval : null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">目標（OKR / MBO）</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              2026年度上期 — 個人目標 {goals.length} 件・承認待ち {pendingCount} 件
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/goals/tree"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🌳 ツリー表示
            </a>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              ＋ 目標を追加
            </button>
          </div>
        </div>

        {/* Action message */}
        {actionMessage && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            {actionMessage}
          </div>
        )}

        {/* Summary bar */}
        <div className="flex flex-wrap gap-4 bg-white rounded-xl border border-gray-200 px-5 py-4">
          {(['pending', 'in_progress', 'completed', 'rejected'] as GoalStatus[]).map((s) => {
            const count = goals.filter((g) => g.status === s).length
            return (
              <div key={s} className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(s)}`}>
                  {statusLabel(s)}
                </span>
                <span className="text-sm font-bold text-gray-800">{count}</span>
              </div>
            )
          })}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <span>合計ウェイト</span>
            <span className={`font-semibold ${totalWeight === 100 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {totalWeight}%
            </span>
          </div>
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left: Goal cards */}
          <div className="space-y-4">
            {sortedGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                isHighlighted={selectedGoalId === goal.id}
                onClick={() => setSelectedGoalId(goal.id === selectedGoalId ? null : goal.id)}
              />
            ))}
          </div>

          {/* Right: Approval panel */}
          <div className="space-y-4">
            {selectedApproval ? (
              <ApprovalPanel
                approval={selectedApproval}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <p className="text-sm text-gray-400">
                  承認待ちの目標カードを<br />クリックすると詳細が表示されます
                </p>
              </div>
            )}

            {/* Progress overview card */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                進捗サマリー
              </h4>
              <div className="space-y-3">
                {sortedGoals.map((goal) => (
                  <div key={goal.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 truncate max-w-[180px]">{goal.title}</span>
                      <span className="font-medium text-gray-800 ml-2">{goal.progressPercent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${progressBarColor(goal.status)}`}
                        style={{ width: `${goal.progressPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
