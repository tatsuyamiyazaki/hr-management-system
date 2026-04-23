/**
 * Issue #198: スキル管理画面
 *
 * - KPI カード 3 枚（登録済みスキル / 本人申告率 / 上長承認待ち）
 * - 左ペイン: スキルマスタ一覧テーブル（カテゴリフィルタ）
 * - 右ペイン: 承認待ち申告パネル（承認 / 差し戻し）
 * - GET /api/skills/catalog — スキルマスタ一覧
 * - GET /api/skills/pending — 承認待ち申告一覧
 * - POST /api/skills/{id}/approve — 承認
 */
'use client'

import { useEffect, useState, useCallback, type ReactElement, type ChangeEvent } from 'react'
import type { SkillMaster } from '@/lib/master/master-types'
import { toSkillMasterId } from '@/lib/master/master-types'
import type { EmployeeSkill } from '@/lib/skill/skill-types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type CatalogState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly skills: readonly SkillMaster[] }

type PendingState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly items: readonly EmployeeSkill[] }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...options })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? null) as T
}

function levelLabel(level: number): string {
  const labels = ['', '初級', '中級', '上級', '熟練', 'エキスパート']
  return labels[level] ?? `Lv.${level}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SkillManagementPage(): ReactElement {
  const [catalogState, setCatalogState] = useState<CatalogState>({ kind: 'loading' })
  const [pendingState, setPendingState] = useState<PendingState>({ kind: 'loading' })
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    setCatalogState({ kind: 'loading' })
    try {
      const skills = await fetchJson<SkillMaster[]>('/api/skills/catalog')
      setCatalogState({ kind: 'ready', skills: Array.isArray(skills) ? skills : [] })
    } catch (err) {
      setCatalogState({ kind: 'error', message: readError(err) })
    }
  }, [])

  const loadPending = useCallback(async () => {
    setPendingState({ kind: 'loading' })
    try {
      const items = await fetchJson<EmployeeSkill[]>('/api/skills/pending')
      setPendingState({ kind: 'ready', items: Array.isArray(items) ? items : [] })
    } catch (err) {
      setPendingState({ kind: 'error', message: readError(err) })
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
    void loadPending()
  }, [loadCatalog, loadPending])

  const handleApprove = useCallback(
    async (skillId: string) => {
      setActionError(null)
      setActionSuccess(null)
      try {
        await fetchJson(`/api/skills/${skillId}/approve`, { method: 'POST' })
        setActionSuccess('承認しました')
        void loadPending()
      } catch (err) {
        setActionError(readError(err))
      }
    },
    [loadPending],
  )

  const handleReject = useCallback((_skillId: string) => {
    setActionError('差し戻し API は現在実装中です')
  }, [])

  const catalogSkills = catalogState.kind === 'ready' ? catalogState.skills : []
  const pendingItems = pendingState.kind === 'ready' ? pendingState.items : []
  const categories = Array.from(new Set(catalogSkills.map((s) => s.category))).sort()
  const pendingCount = pendingItems.length
  const filteredSkills = categoryFilter
    ? catalogSkills.filter((s) => s.category === categoryFilter)
    : catalogSkills

  return (
    <main className="mx-auto max-w-7xl px-8 py-10">
      {/* Header */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
            Skills
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">スキル管理</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            マスタ {catalogSkills.length} スキル・承認待ち{' '}
            <span className="font-semibold text-amber-600">{pendingCount} 件</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            マスタを編集
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            CSV 一括登録
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            登録済みスキル
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">
            {catalogState.kind === 'loading' ? '…' : catalogSkills.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">{categories.length} カテゴリ</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-indigo-500 uppercase">
            本人申告率
          </p>
          <p className="mt-2 text-3xl font-bold text-indigo-700 tabular-nums">—</p>
          <p className="mt-1 text-xs text-indigo-500">集計データ準備中</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-amber-600 uppercase">
            上長承認待ち
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-700 tabular-nums">
            {pendingState.kind === 'loading' ? '…' : pendingCount}
          </p>
          {pendingCount > 0 ? (
            <span className="mt-1 inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              処理要
            </span>
          ) : (
            <p className="mt-1 text-xs text-amber-600">対応不要</p>
          )}
        </div>
      </div>

      {/* Action feedback */}
      {actionError && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✓ {actionSuccess}
        </div>
      )}

      {/* 2-column layout */}
      <div className="flex gap-5">
        {/* Left: Skill Master Table */}
        <section className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">スキルマスタ一覧</h2>
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none"
              >
                <option value="">すべてのカテゴリ</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                ＋ 追加
              </button>
            </div>
          </div>
          <SkillCatalogTable state={catalogState} skills={filteredSkills} />
        </section>

        {/* Right: Pending Approvals */}
        <aside className="w-80 shrink-0">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800">承認待ち申告</h2>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {pendingCount}
              </span>
            )}
          </div>
          <PendingPanel
            state={pendingState}
            catalog={catalogSkills}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </aside>
      </div>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillCatalogTable
// ─────────────────────────────────────────────────────────────────────────────

interface SkillCatalogTableProps {
  readonly state: CatalogState
  readonly skills: readonly SkillMaster[]
}

function SkillCatalogTable({ state, skills }: SkillCatalogTableProps): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">スキルマスタの取得に失敗しました</p>
        <p className="mt-1 text-xs opacity-80">{state.message}</p>
      </div>
    )
  }
  if (skills.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
        スキルが見つかりませんでした
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <th className="px-4 py-3">スキル名</th>
            <th className="px-4 py-3">カテゴリ</th>
            <th className="px-4 py-3">レベル上限</th>
            <th className="px-3 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillRow
// ─────────────────────────────────────────────────────────────────────────────

interface SkillRowProps {
  readonly skill: SkillMaster
}

const CATEGORY_COLORS: Record<string, string> = {
  技術: 'bg-blue-100 text-blue-700',
  マネジメント: 'bg-purple-100 text-purple-700',
  コミュニケーション: 'bg-green-100 text-green-700',
  語学: 'bg-orange-100 text-orange-700',
}

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'bg-slate-100 text-slate-600'
}

function SkillRow({ skill }: SkillRowProps): ReactElement {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{skill.name}</p>
        {skill.description && (
          <p className="mt-0.5 max-w-[200px] truncate text-xs text-slate-400">
            {skill.description}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor(skill.category)}`}
        >
          {skill.category}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">Lv.5 まで</td>
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          編集
        </button>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PendingPanel
// ─────────────────────────────────────────────────────────────────────────────

interface PendingPanelProps {
  readonly state: PendingState
  readonly catalog: readonly SkillMaster[]
  readonly onApprove: (id: string) => Promise<void>
  readonly onReject: (id: string) => void
}

function PendingPanel({ state, catalog, onApprove, onReject }: PendingPanelProps): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">承認待ち一覧の取得に失敗しました</p>
        <p className="mt-1 text-xs opacity-80">{state.message}</p>
      </div>
    )
  }
  if (state.items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
        承認待ちはありません
      </div>
    )
  }

  const skillMap = new Map(catalog.map((s) => [s.id, s]))

  return (
    <div className="space-y-3">
      {state.items.map((item) => (
        <PendingCard
          key={item.id}
          item={item}
          skillName={skillMap.get(toSkillMasterId(item.skillId))?.name ?? item.skillId}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PendingCard
// ─────────────────────────────────────────────────────────────────────────────

interface PendingCardProps {
  readonly item: EmployeeSkill
  readonly skillName: string
  readonly onApprove: (id: string) => Promise<void>
  readonly onReject: (id: string) => void
}

function PendingCard({ item, skillName, onApprove, onReject }: PendingCardProps): ReactElement {
  const [approving, setApproving] = useState(false)

  async function handleApprove(): Promise<void> {
    setApproving(true)
    try {
      await onApprove(item.id)
    } finally {
      setApproving(false)
    }
  }

  const initials = item.userId.slice(0, 2).toUpperCase()
  const acquiredDate = new Date(item.acquiredAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Applicant row */}
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{item.userId}</p>
          <p className="text-xs text-slate-400">申告日: {acquiredDate}</p>
        </div>
      </div>

      {/* Skill info */}
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="font-semibold text-slate-800">{skillName}</span>
        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
          {levelLabel(item.level)}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onReject(item.id)}
          className="flex-1 rounded-lg border border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          差し戻し
        </button>
        <button
          type="button"
          disabled={approving}
          onClick={handleApprove}
          className="flex-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {approving ? '処理中…' : '承認'}
        </button>
      </div>
    </div>
  )
}
