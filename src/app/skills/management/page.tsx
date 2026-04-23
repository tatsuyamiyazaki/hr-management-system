'use client'

import { useCallback, useEffect, useState, type ChangeEvent } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SkillCategory = 'TECHNICAL' | 'BUSINESS' | 'MANAGEMENT' | 'LANGUAGE' | 'OTHER'

interface SkillMaster {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: SkillCategory
  readonly maxLevel: 1 | 2 | 3 | 4 | 5
  readonly holderCount: number
}

interface SkillApproval {
  readonly id: string
  readonly employeeId: string
  readonly employeeName: string
  readonly departmentName: string
  readonly avatarColor: string
  readonly skillId: string
  readonly skillName: string
  readonly currentLevel: number
  readonly requestedLevel: number
  readonly reason: string
  readonly submittedAt: string
}

type SkillManagementState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly skills: readonly SkillMaster[]
      readonly pendingApprovals: readonly SkillApproval[]
    }
  | { readonly kind: 'error'; readonly message: string }

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SKILLS: readonly SkillMaster[] = [
  { id: 's1', name: 'TypeScript', description: '型付き JavaScript 開発', category: 'TECHNICAL', maxLevel: 5, holderCount: 142 },
  { id: 's2', name: 'React', description: 'UIコンポーネントライブラリ', category: 'TECHNICAL', maxLevel: 5, holderCount: 118 },
  { id: 's3', name: 'Next.js', description: 'React フルスタックフレームワーク', category: 'TECHNICAL', maxLevel: 5, holderCount: 87 },
  { id: 's4', name: 'PostgreSQL', description: 'リレーショナルデータベース', category: 'TECHNICAL', maxLevel: 5, holderCount: 64 },
  { id: 's5', name: 'Docker', description: 'コンテナ仮想化', category: 'TECHNICAL', maxLevel: 5, holderCount: 73 },
  { id: 's6', name: 'AWS', description: 'クラウドインフラ', category: 'TECHNICAL', maxLevel: 5, holderCount: 91 },
  { id: 's7', name: 'プロジェクト管理', description: 'スケジュール・リスク管理', category: 'MANAGEMENT', maxLevel: 4, holderCount: 56 },
  { id: 's8', name: 'チームリーダーシップ', description: 'チームの方向性・育成', category: 'MANAGEMENT', maxLevel: 4, holderCount: 38 },
  { id: 's9', name: '戦略立案', description: '事業戦略・施策企画', category: 'BUSINESS', maxLevel: 4, holderCount: 29 },
  { id: 's10', name: '営業交渉', description: 'クライアント折衝・契約', category: 'BUSINESS', maxLevel: 5, holderCount: 47 },
  { id: 's11', name: 'マーケティング分析', description: 'データ分析・施策評価', category: 'BUSINESS', maxLevel: 4, holderCount: 33 },
  { id: 's12', name: '英語', description: 'ビジネス英語', category: 'LANGUAGE', maxLevel: 5, holderCount: 212 },
  { id: 's13', name: '中国語', description: 'ビジネス中国語', category: 'LANGUAGE', maxLevel: 5, holderCount: 41 },
  { id: 's14', name: 'ファシリテーション', description: '会議・ワークショップ進行', category: 'OTHER', maxLevel: 4, holderCount: 55 },
]

const MOCK_APPROVALS: readonly SkillApproval[] = [
  {
    id: 'ap1',
    employeeId: 'e001',
    employeeName: '田中 健太',
    departmentName: '開発部',
    avatarColor: 'bg-indigo-100 text-indigo-700',
    skillId: 's1',
    skillName: 'TypeScript',
    currentLevel: 3,
    requestedLevel: 4,
    reason: 'プロジェクトで型安全な設計を主導し、チーム全体のコード品質向上に貢献しました。',
    submittedAt: '2026-04-21T09:15:00',
  },
  {
    id: 'ap2',
    employeeId: 'e002',
    employeeName: '佐藤 美咲',
    departmentName: '営業部',
    avatarColor: 'bg-emerald-100 text-emerald-700',
    skillId: 's10',
    skillName: '営業交渉',
    currentLevel: 2,
    requestedLevel: 3,
    reason: '今期3件の大型契約を主導し、交渉スキルが前期比で大幅に向上しました。',
    submittedAt: '2026-04-20T14:30:00',
  },
  {
    id: 'ap3',
    employeeId: 'e003',
    employeeName: '鈴木 直人',
    departmentName: 'インフラ部',
    avatarColor: 'bg-sky-100 text-sky-700',
    skillId: 's6',
    skillName: 'AWS',
    currentLevel: 3,
    requestedLevel: 4,
    reason: 'AWSソリューションアーキテクトProを取得し、マルチリージョン構成を実装しました。',
    submittedAt: '2026-04-19T11:45:00',
  },
  {
    id: 'ap4',
    employeeId: 'e004',
    employeeName: '山田 奈々',
    departmentName: 'QA部',
    avatarColor: 'bg-rose-100 text-rose-700',
    skillId: 's7',
    skillName: 'プロジェクト管理',
    currentLevel: 1,
    requestedLevel: 2,
    reason: '複数の改善プロジェクトでサブリードを担当し、スケジュール管理を習得しました。',
    submittedAt: '2026-04-18T16:00:00',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...options })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function categoryLabel(cat: SkillCategory): string {
  const labels: Record<SkillCategory, string> = {
    TECHNICAL: '技術',
    BUSINESS: 'ビジネス',
    MANAGEMENT: 'マネジメント',
    LANGUAGE: '語学',
    OTHER: 'その他',
  }
  return labels[cat]
}

function categoryColor(cat: SkillCategory): string {
  const colors: Record<SkillCategory, string> = {
    TECHNICAL: 'bg-blue-100 text-blue-700',
    BUSINESS: 'bg-amber-100 text-amber-700',
    MANAGEMENT: 'bg-purple-100 text-purple-700',
    LANGUAGE: 'bg-green-100 text-green-700',
    OTHER: 'bg-gray-100 text-gray-600',
  }
  return colors[cat]
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: {
  readonly approval: SkillApproval
  readonly onApprove: (id: string) => Promise<void>
  readonly onReject: (id: string) => Promise<void>
}) {
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  async function handleApprove() {
    setApproving(true)
    try {
      await onApprove(approval.id)
    } finally {
      setApproving(false)
    }
  }

  async function handleReject() {
    setRejecting(true)
    try {
      await onReject(approval.id)
    } finally {
      setRejecting(false)
    }
  }

  const initials = approval.employeeName.replace(/\s/g, '').slice(0, 1)

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Applicant */}
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${approval.avatarColor}`}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{approval.employeeName}</p>
          <p className="text-xs text-gray-500">{approval.departmentName}</p>
        </div>
        <span className="text-xs text-gray-400">{formatSubmittedAt(approval.submittedAt)}</span>
      </div>

      {/* Skill + level */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-sm font-semibold text-gray-800">{approval.skillName}</span>
        <span className="text-xs text-gray-400">
          Lv{approval.currentLevel} →{' '}
          <span className="font-bold text-indigo-600">Lv{approval.requestedLevel}</span>
        </span>
      </div>

      {/* Reason */}
      <p className="line-clamp-2 text-xs leading-relaxed text-gray-600">{approval.reason}</p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleReject}
          disabled={rejecting || approving}
          className="flex-1 rounded-lg border border-rose-300 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
        >
          {rejecting ? '処理中…' : '差し戻し'}
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={approving || rejecting}
          className="flex-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {approving ? '処理中…' : '承認'}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SkillManagementPage() {
  const [state, setState] = useState<SkillManagementState>({ kind: 'loading' })
  const [categoryFilter, setCategoryFilter] = useState<SkillCategory | ''>('')
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  useEffect(() => {
    async function load() {
      const [skillsData, approvalsData] = await Promise.all([
        fetchJson<SkillMaster[]>('/api/skills/catalog'),
        fetchJson<SkillApproval[]>('/api/skills/approvals?status=PENDING'),
      ])
      setState({
        kind: 'ready',
        skills: skillsData ?? [...MOCK_SKILLS],
        pendingApprovals: approvalsData ?? [...MOCK_APPROVALS],
      })
    }
    void load()
  }, [])

  const handleApprove = useCallback(async (id: string) => {
    await fetchJson<{ success: boolean }>(`/api/skills/approvals/${id}/approve`, {
      method: 'POST',
    })
    setState((prev) =>
      prev.kind === 'ready'
        ? { ...prev, pendingApprovals: prev.pendingApprovals.filter((a) => a.id !== id) }
        : prev
    )
    setActionMessage({ type: 'success', text: '申告を承認しました。' })
  }, [])

  const handleReject = useCallback(async (id: string) => {
    await fetchJson<{ success: boolean }>(`/api/skills/approvals/${id}/reject`, {
      method: 'POST',
    })
    setState((prev) =>
      prev.kind === 'ready'
        ? { ...prev, pendingApprovals: prev.pendingApprovals.filter((a) => a.id !== id) }
        : prev
    )
    setActionMessage({ type: 'success', text: '差し戻しました。' })
  }, [])

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="animate-pulse text-sm text-gray-400">読み込み中…</p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-rose-500">{state.message}</p>
      </div>
    )
  }

  const { skills, pendingApprovals } = state
  const categoryOptions = Array.from(
    new Set(skills.map((s) => s.category))
  ).sort() as SkillCategory[]
  const filteredSkills = categoryFilter
    ? skills.filter((s) => s.category === categoryFilter)
    : skills
  const pendingCount = pendingApprovals.length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">スキル管理</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              スキルマスタの管理と申告の承認を行います
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            CSV 一括登録
          </button>
        </div>

        {/* Action message */}
        {actionMessage && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              actionMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              登録済みスキル
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{skills.length}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-500">{categoryOptions.length} カテゴリ</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                ＋3 今月追加
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
              本人申告率
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-indigo-700">89.2%</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-indigo-500">1,113 / 1,248名</span>
              <span className="rounded-full bg-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                ↑4.1pt 先月比
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
              上長承認待ち
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-amber-700">{pendingCount}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-amber-600">平均 2.1日</span>
              {pendingCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                  🔴 処理要
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main 2-column layout */}
        <div className="flex gap-5">
          {/* Left: Skill Master Table */}
          <section className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-800">スキルマスタ</h2>
              <div className="flex items-center gap-2">
                <select
                  value={categoryFilter}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setCategoryFilter(e.target.value as SkillCategory | '')
                  }
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none"
                >
                  <option value="">すべてのカテゴリ</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {categoryLabel(cat)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                  ＋ スキルを追加
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                    <th className="px-4 py-3">スキル名</th>
                    <th className="px-4 py-3">カテゴリ</th>
                    <th className="px-4 py-3">最大レベル</th>
                    <th className="px-4 py-3">保有者数</th>
                    <th className="px-3 py-3 text-right">─</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSkills.map((skill) => (
                    <tr key={skill.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{skill.name}</p>
                        {skill.description && (
                          <p className="mt-0.5 max-w-[220px] truncate text-xs text-gray-400">
                            {skill.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor(skill.category)}`}
                        >
                          {categoryLabel(skill.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">Lv{skill.maxLevel}</td>
                      <td className="px-4 py-3 tabular-nums text-xs text-gray-700">
                        {skill.holderCount}名
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100"
                          title="編集"
                        >
                          ✏️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSkills.length === 0 && (
                <div className="py-12 text-center text-sm text-gray-400">
                  該当するスキルが見つかりませんでした
                </div>
              )}
            </div>
          </section>

          {/* Right: Pending Approvals */}
          <aside className="w-80 shrink-0">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800">承認待ち申告</h2>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                  {pendingCount}
                </span>
              )}
            </div>

            {pendingApprovals.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
                承認待ちはありません
              </div>
            ) : (
              <div className="space-y-3">
                {pendingApprovals.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    approval={approval}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
