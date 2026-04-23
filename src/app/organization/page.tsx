'use client'

import { useCallback, useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgNode {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly parentId: string | null
  readonly managerId: string | null
  readonly managerName: string | null
  readonly memberCount: number
  readonly costCenter: string
  readonly effectiveDate: string
  readonly status: 'ACTIVE' | 'INACTIVE'
  readonly children: readonly OrgNode[]
}

interface OrgMemberBreakdown {
  readonly role: string
  readonly count: number
}

interface OrgDetail extends OrgNode {
  readonly breakdown: readonly OrgMemberBreakdown[]
  readonly nextRestructureDate: string | null
}

type OrgTreeState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly tree: readonly OrgNode[]; readonly selected: OrgNode | null }
  | { readonly kind: 'error'; readonly message: string }

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TREE: readonly OrgNode[] = [
  {
    id: 'org-1',
    code: 'ORG-001',
    name: '経営本部',
    parentId: null,
    managerId: 'u-1',
    managerName: '山田 太郎',
    memberCount: 48,
    costCenter: 'CC-1001',
    effectiveDate: '2026-04-01',
    status: 'ACTIVE',
    children: [
      {
        id: 'org-1-1',
        code: 'ORG-011',
        name: '経営企画部',
        parentId: 'org-1',
        managerId: 'u-2',
        managerName: '佐藤 花子',
        memberCount: 18,
        costCenter: 'CC-1011',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
      {
        id: 'org-1-2',
        code: 'ORG-012',
        name: '広報・IR部',
        parentId: 'org-1',
        managerId: 'u-3',
        managerName: '鈴木 健',
        memberCount: 12,
        costCenter: 'CC-1012',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
      {
        id: 'org-1-3',
        code: 'ORG-013',
        name: '法務部',
        parentId: 'org-1',
        managerId: 'u-4',
        managerName: '田中 誠',
        memberCount: 10,
        costCenter: 'CC-1013',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
    ],
  },
  {
    id: 'org-2',
    code: 'ORG-002',
    name: '営業本部',
    parentId: null,
    managerId: 'u-5',
    managerName: '中村 由美',
    memberCount: 320,
    costCenter: 'CC-2001',
    effectiveDate: '2026-04-01',
    status: 'ACTIVE',
    children: [
      {
        id: 'org-2-1',
        code: 'ORG-021',
        name: '第一営業部',
        parentId: 'org-2',
        managerId: 'u-6',
        managerName: '小林 直人',
        memberCount: 85,
        costCenter: 'CC-2011',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [
          {
            id: 'org-2-1-1',
            code: 'ORG-0211',
            name: '東日本チーム',
            parentId: 'org-2-1',
            managerId: 'u-7',
            managerName: '加藤 真理',
            memberCount: 42,
            costCenter: 'CC-20111',
            effectiveDate: '2026-04-01',
            status: 'ACTIVE',
            children: [],
          },
          {
            id: 'org-2-1-2',
            code: 'ORG-0212',
            name: '西日本チーム',
            parentId: 'org-2-1',
            managerId: 'u-8',
            managerName: '渡辺 裕子',
            memberCount: 43,
            costCenter: 'CC-20112',
            effectiveDate: '2026-04-01',
            status: 'ACTIVE',
            children: [],
          },
        ],
      },
      {
        id: 'org-2-2',
        code: 'ORG-022',
        name: '第二営業部',
        parentId: 'org-2',
        managerId: 'u-9',
        managerName: '伊藤 拓也',
        memberCount: 92,
        costCenter: 'CC-2012',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
      {
        id: 'org-2-3',
        code: 'ORG-023',
        name: '海外営業部',
        parentId: 'org-2',
        managerId: 'u-10',
        managerName: '山本 彩',
        memberCount: 60,
        costCenter: 'CC-2013',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
    ],
  },
  {
    id: 'org-3',
    code: 'ORG-003',
    name: '技術本部',
    parentId: null,
    managerId: 'u-11',
    managerName: '松本 剛',
    memberCount: 280,
    costCenter: 'CC-3001',
    effectiveDate: '2026-04-01',
    status: 'ACTIVE',
    children: [
      {
        id: 'org-3-1',
        code: 'ORG-031',
        name: '開発部',
        parentId: 'org-3',
        managerId: 'u-12',
        managerName: '井上 翔太',
        memberCount: 140,
        costCenter: 'CC-3011',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
      {
        id: 'org-3-2',
        code: 'ORG-032',
        name: 'インフラ部',
        parentId: 'org-3',
        managerId: 'u-13',
        managerName: '木村 安奈',
        memberCount: 70,
        costCenter: 'CC-3012',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
      {
        id: 'org-3-3',
        code: 'ORG-033',
        name: 'QA部',
        parentId: 'org-3',
        managerId: 'u-14',
        managerName: '橋本 憲司',
        memberCount: 45,
        costCenter: 'CC-3013',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
    ],
  },
  {
    id: 'org-4',
    code: 'ORG-004',
    name: '管理本部',
    parentId: null,
    managerId: 'u-15',
    managerName: '清水 陽子',
    memberCount: 120,
    costCenter: 'CC-4001',
    effectiveDate: '2026-04-01',
    status: 'ACTIVE',
    children: [
      {
        id: 'org-4-1',
        code: 'ORG-041',
        name: '人事部',
        parentId: 'org-4',
        managerId: 'u-16',
        managerName: '藤田 誠一',
        memberCount: 35,
        costCenter: 'CC-4011',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
      {
        id: 'org-4-2',
        code: 'ORG-042',
        name: '財務・経理部',
        parentId: 'org-4',
        managerId: 'u-17',
        managerName: '岡田 明美',
        memberCount: 42,
        costCenter: 'CC-4012',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
      {
        id: 'org-4-3',
        code: 'ORG-043',
        name: '総務部',
        parentId: 'org-4',
        managerId: 'u-18',
        managerName: '前田 光雄',
        memberCount: 28,
        costCenter: 'CC-4013',
        effectiveDate: '2026-04-01',
        status: 'ACTIVE',
        children: [],
      },
    ],
  },
]

const MOCK_DETAIL: Record<string, OrgDetail> = {
  'org-1': {
    ...MOCK_TREE[0]!,
    breakdown: [
      { role: '本部長', count: 1 },
      { role: 'シニア', count: 14 },
      { role: 'ミドル', count: 20 },
      { role: 'ジュニア', count: 13 },
    ],
    nextRestructureDate: '2026-10-01',
  },
  'org-2': {
    ...MOCK_TREE[1]!,
    breakdown: [
      { role: '本部長', count: 1 },
      { role: 'マネージャー', count: 4 },
      { role: 'シニア', count: 80 },
      { role: 'ミドル', count: 140 },
      { role: 'ジュニア', count: 95 },
    ],
    nextRestructureDate: null,
  },
  'org-3': {
    ...MOCK_TREE[2]!,
    breakdown: [
      { role: '本部長', count: 1 },
      { role: 'マネージャー', count: 3 },
      { role: 'シニア', count: 70 },
      { role: 'ミドル', count: 120 },
      { role: 'ジュニア', count: 86 },
    ],
    nextRestructureDate: '2026-10-01',
  },
  'org-4': {
    ...MOCK_TREE[3]!,
    breakdown: [
      { role: '本部長', count: 1 },
      { role: 'マネージャー', count: 3 },
      { role: 'シニア', count: 30 },
      { role: 'ミドル', count: 55 },
      { role: 'ジュニア', count: 31 },
    ],
    nextRestructureDate: null,
  },
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

function buildNodeMap(nodes: readonly OrgNode[]): Map<string, OrgNode> {
  const map = new Map<string, OrgNode>()
  function walk(node: OrgNode): void {
    map.set(node.id, node)
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return map
}

function sumMembers(nodes: readonly OrgNode[]): number {
  return nodes.reduce((sum, n) => sum + n.memberCount, 0)
}

function countAllDepts(nodes: readonly OrgNode[]): number {
  let count = 0
  function walk(node: OrgNode): void {
    count++
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return count
}

function roleColor(role: string): string {
  if (role.includes('本部長') || role.includes('マネージャー'))
    return 'bg-indigo-100 text-indigo-800'
  if (role.includes('シニア')) return 'bg-emerald-100 text-emerald-800'
  if (role.includes('ミドル')) return 'bg-sky-100 text-sky-800'
  return 'bg-gray-100 text-gray-700'
}

// ─── OrgTreeNode (recursive) ─────────────────────────────────────────────────

function OrgTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  readonly node: OrgNode
  readonly depth: number
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.children.length > 0
  const isSelected = node.id === selectedId
  const icon = depth === 0 ? '🏢' : depth === 1 ? '📁' : '📂'
  const managerLabel = depth === 0 ? '本部長' : depth === 1 ? '部長' : 'リーダー'

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node.id)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(node.id)}
        className={`flex cursor-pointer items-center gap-2 rounded-lg py-2 pr-3 text-sm transition-colors ${
          isSelected
            ? 'bg-indigo-100 font-semibold text-indigo-800'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${(depth + 1) * 14}px` }}
      >
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-400"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) setExpanded((v) => !v)
          }}
          aria-label={expanded ? '折りたたむ' : '展開する'}
        >
          {hasChildren ? (
            <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
          ) : (
            <span className="text-[10px] text-gray-300">•</span>
          )}
        </button>

        <span className="text-base">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{node.name}</span>

        {node.managerName && (
          <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600">
            {managerLabel}
          </span>
        )}
        <span className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-600">
          {node.memberCount}名
        </span>
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

// ─── InfoField ────────────────────────────────────────────────────────────────

function InfoField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}

// ─── OrgDetailPanel ───────────────────────────────────────────────────────────

function OrgDetailPanel({
  node,
  parentName,
}: {
  readonly node: OrgNode
  readonly parentName: string | null
}) {
  const detail = MOCK_DETAIL[node.id] ?? null
  const breakdown = detail?.breakdown ?? []
  const nextDate = detail?.nextRestructureDate ?? null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{node.parentId ? '📁' : '🏢'}</span>
            <h2 className="text-xl font-bold text-gray-900">{node.name}</h2>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">コード: {node.code}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            node.status === 'ACTIVE'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {node.status === 'ACTIVE' ? '有効' : '無効'}
        </span>
      </div>

      {/* Next restructure banner */}
      {nextDate && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <span>ℹ️</span>
          <span>
            <span className="font-semibold">{nextDate}</span> に組織改編が予定されています
          </span>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        <InfoField label="組織コード" value={node.code} />
        <InfoField label="親組織" value={parentName ?? '（ルート）'} />
        <InfoField label="発令日" value={node.effectiveDate} />
        <InfoField label="コストセンター" value={node.costCenter} />
        <InfoField label="メンバー数" value={`${node.memberCount} 名`} />
      </div>

      {/* Manager block */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="mb-2 text-xs font-medium text-gray-500">マネージャー</p>
        {node.managerName ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              {node.managerName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{node.managerName}</p>
              <p className="text-xs text-gray-400">ID: {node.managerId}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">未設定</p>
        )}
      </div>

      {/* Member breakdown */}
      {breakdown.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-500">メンバー構成</p>
          <div className="flex flex-wrap gap-2">
            {breakdown.map((b) => (
              <span
                key={b.role}
                className={`rounded-full px-3 py-1 text-xs font-medium ${roleColor(b.role)}`}
              >
                {b.role} × {b.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sub-departments */}
      {node.children.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-500">配下部署</p>
          <div className="flex flex-wrap gap-2">
            {node.children.map((child) => (
              <span
                key={child.id}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 shadow-sm"
              >
                📁 {child.name}
                <span className="ml-1 text-gray-400">({child.memberCount}名)</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizationPage() {
  const [state, setState] = useState<OrgTreeState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const data = await fetchJson<{ roots: OrgNode[] }>('/api/organization/tree')
      if (data?.roots) {
        setState({ kind: 'ready', tree: data.roots, selected: null })
        setSelectedId(data.roots[0]?.id ?? null)
      } else {
        setState({ kind: 'ready', tree: MOCK_TREE, selected: null })
        setSelectedId(MOCK_TREE[0]?.id ?? null)
      }
    }
    void load()
  }, [])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="animate-pulse text-sm text-gray-400">組織データを読み込み中…</p>
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

  const { tree } = state
  const nodeMap = buildNodeMap(tree)
  const selectedNode = selectedId ? (nodeMap.get(selectedId) ?? null) : null
  const parentNode =
    selectedNode?.parentId ? (nodeMap.get(selectedNode.parentId) ?? null) : null

  const totalMemberCount = sumMembers(tree)
  const deptCount = countAllDepts(tree)
  const rootCount = tree.length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">組織体制</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {totalMemberCount.toLocaleString()}名
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {rootCount}本部
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {deptCount}部署
              </span>
              <span className="text-xs text-gray-400">有効日 2026-04-01</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              有効日で比較
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              履歴
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              ＋ 組織を追加
            </button>
          </div>
        </div>

        {/* Main 2-column layout */}
        <div
          className="flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
          style={{ minHeight: '600px' }}
        >
          {/* Left: Org Tree */}
          <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 py-4">
            <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              組織ツリー
            </p>
            <ul className="space-y-0.5 px-2">
              {tree.map((root) => (
                <OrgTreeNode
                  key={root.id}
                  node={root}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
              ))}
            </ul>
          </aside>

          {/* Right: Detail Panel */}
          <section className="min-w-0 flex-1 overflow-y-auto p-6">
            {selectedNode ? (
              <OrgDetailPanel
                node={selectedNode}
                parentName={parentNode?.name ?? null}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                左のツリーから部署を選択してください
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
