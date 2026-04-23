/**
 * Issue #197: 組織体制画面リデザイン
 *
 * - 左ペイン: 折りたたみ可能な組織ツリー（ノード選択・展開/折りたたみ）
 * - 右ペイン: 選択組織の詳細パネル（名称・上位部署・マネージャー・在籍数・日付・状態）
 * - GET /api/organization/tree — 組織ツリー取得
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import type { OrgNode, OrgTree } from '@/lib/organization/organization-types'
import { countMembers } from '@/lib/organization/org-tree-ops'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready'
      readonly tree: OrgTree
      readonly nodeMap: ReadonlyMap<string, OrgNode>
    }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

function buildNodeMap(roots: readonly OrgNode[]): Map<string, OrgNode> {
  const map = new Map<string, OrgNode>()
  function walk(node: OrgNode): void {
    map.set(node.id, node)
    for (const child of node.children) walk(child)
  }
  for (const root of roots) walk(root)
  return map
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

function getManagerName(node: OrgNode): string {
  const holder = node.positions.find((p) => p.holderUserId !== null)
  return holder?.holderName ?? holder?.holderUserId ?? '—'
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function OrganizationPage(): ReactElement {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/organization/tree', { cache: 'no-store' })
        const payload = ((await res.json().catch(() => ({}))) ?? {}) as ApiEnvelope<OrgTree>
        if (!res.ok || !payload.data) {
          throw new Error(payload.error ?? `HTTP ${res.status}`)
        }
        const tree = payload.data
        const nodeMap = buildNodeMap(tree.roots)
        if (cancelled) return
        setState({ kind: 'ready', tree, nodeMap })
        if (tree.roots.length > 0 && tree.roots[0]) {
          setSelectedId(tree.roots[0].id)
        }
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
        <PageHeader />
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 text-sm text-slate-500">
          <span className="animate-pulse">組織データを読み込み中…</span>
        </div>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <PageHeader />
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-semibold">組織データの取得に失敗しました</p>
          <p className="mt-1 text-xs opacity-80">{state.message}</p>
        </div>
      </main>
    )
  }

  const selectedNode = selectedId ? (state.nodeMap.get(selectedId) ?? null) : null
  const parentNode =
    selectedNode?.parentId ? (state.nodeMap.get(selectedNode.parentId) ?? null) : null

  const totalDepts = state.nodeMap.size
  const totalMembers = state.tree.roots.reduce((sum, r) => sum + countMembers(r), 0)
  const rootCount = state.tree.roots.length

  return (
    <main className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader />

      {/* KPI Summary */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">部署数</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{totalDepts}</p>
          <p className="mt-1 text-xs text-slate-500">登録部署の合計</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-indigo-500 uppercase">
            在籍人数
          </p>
          <p className="mt-2 text-3xl font-bold text-indigo-700 tabular-nums">{totalMembers}</p>
          <p className="mt-1 text-xs text-indigo-500">全部署の合計メンバー数</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-emerald-600 uppercase">
            ルート部署
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-700 tabular-nums">{rootCount}</p>
          <p className="mt-1 text-xs text-emerald-600">最上位の組織単位数</p>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Left: Org Tree */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 py-4">
          <p className="mb-2 px-4 text-xs font-semibold tracking-wider text-slate-400 uppercase">
            組織ツリー
          </p>
          <OrgTreePanel
            roots={state.tree.roots}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>

        {/* Right: Detail Panel */}
        <section className="min-w-0 flex-1 p-6">
          {selectedNode ? (
            <OrgDetailPanel node={selectedNode} parentNode={parentNode} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              左のツリーから部署を選択してください
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader
// ─────────────────────────────────────────────────────────────────────────────

function PageHeader(): ReactElement {
  return (
    <header className="mb-8">
      <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
        Organization
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">組織体制</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        組織ツリーを閲覧し、各部署の詳細情報を確認します。
      </p>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OrgTreePanel
// ─────────────────────────────────────────────────────────────────────────────

interface OrgTreePanelProps {
  readonly roots: readonly OrgNode[]
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
}

function OrgTreePanel({ roots, selectedId, onSelect }: OrgTreePanelProps): ReactElement {
  return (
    <ul className="space-y-0.5 px-2">
      {roots.map((root) => (
        <OrgTreeNode
          key={root.id}
          node={root}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OrgTreeNode (recursive)
// ─────────────────────────────────────────────────────────────────────────────

interface OrgTreeNodeProps {
  readonly node: OrgNode
  readonly depth: number
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
}

function OrgTreeNode({ node, depth, selectedId, onSelect }: OrgTreeNodeProps): ReactElement {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0
  const isSelected = node.id === selectedId
  const memberCount = countMembers(node)
  const hasManager = node.positions.some((p) => p.holderUserId !== null)

  return (
    <li>
      <div
        className={`flex cursor-pointer items-center gap-2 rounded-lg py-2 pr-2 text-sm transition-colors ${
          isSelected
            ? 'bg-indigo-100 font-medium text-indigo-800'
            : 'text-slate-700 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* expand/collapse toggle */}
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) setExpanded((v) => !v)
          }}
          aria-label={expanded ? '折りたたむ' : '展開する'}
        >
          {hasChildren ? (
            <span className="text-xs">{expanded ? '▼' : '▶'}</span>
          ) : (
            <span className="text-xs text-slate-300">•</span>
          )}
        </button>

        {/* org icon */}
        <span className="text-base">{depth === 0 ? '🏢' : '📁'}</span>

        {/* name */}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>

        {/* member count badge */}
        <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600">
          {memberCount}
        </span>

        {/* manager badge */}
        {hasManager && (
          <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
            M
          </span>
        )}
      </div>

      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OrgDetailPanel
// ─────────────────────────────────────────────────────────────────────────────

interface OrgDetailPanelProps {
  readonly node: OrgNode
  readonly parentNode: OrgNode | null
}

function OrgDetailPanel({ node, parentNode }: OrgDetailPanelProps): ReactElement {
  const memberCount = countMembers(node)
  const directCount = node.positions.filter((p) => p.holderUserId !== null).length
  const managerName = getManagerName(node)
  const isActive = !node.department?.deletedAt
  const createdAt = node.department?.createdAt ?? null
  const childCount = node.children.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{node.parentId ? '📁' : '🏢'}</span>
            <h2 className="text-xl font-semibold text-slate-900">{node.name}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">ID: {node.id}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
            isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {isActive ? '稼働中' : '廃止済み'}
        </span>
      </div>

      {/* Fields grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldCard label="上位部署" value={parentNode?.name ?? '（ルート）'} />
        <FieldCard label="直属マネージャー" value={managerName} />
        <FieldCard
          label="在籍人数（直下）"
          value={`${directCount} 名`}
          sub={`配下合計: ${memberCount} 名`}
        />
        <FieldCard label="子部署数" value={`${childCount} 部署`} />
        <FieldCard label="作成日" value={formatDate(createdAt)} />
        <FieldCard label="ポジション数" value={`${node.positions.length} ポジション`} />
      </div>

      {/* Positions list */}
      {node.positions.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">ポジション一覧</p>
          <div className="space-y-2">
            {node.positions.map((pos) => (
              <div
                key={pos.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {pos.holderName ?? pos.holderUserId ?? '空席'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Role: {pos.roleId}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    pos.holderUserId
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {pos.holderUserId ? '在籍' : '空席'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Child departments */}
      {node.children.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">配下部署</p>
          <div className="flex flex-wrap gap-2">
            {node.children.map((child) => (
              <span
                key={child.id}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm"
              >
                📁 {child.name}
                <span className="ml-1 text-slate-400">({countMembers(child)})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldCard
// ─────────────────────────────────────────────────────────────────────────────

interface FieldCardProps {
  readonly label: string
  readonly value: string
  readonly sub?: string
}

function FieldCard({ label, value, sub }: FieldCardProps): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}
