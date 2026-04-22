/**
 * Issue #177 / Task 13.1 / Req 6.1, 6.2: 多階層組織目標ツリー画面
 *
 * - 全ロールアクセス可能（参照）
 * - GET /api/goals/org?tree=1 で組織目標ツリーを取得
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'

type GoalType = 'OKR' | 'MBO'
type GoalOwnerType = 'ORGANIZATION' | 'DEPARTMENT' | 'TEAM'

interface OrgGoalTree {
  readonly id: string
  readonly parentId: string | null
  readonly ownerType: GoalOwnerType
  readonly ownerId: string
  readonly title: string
  readonly description: string | null
  readonly goalType: GoalType
  readonly keyResult: string | null
  readonly targetValue: number | null
  readonly unit: string | null
  readonly startDate: string
  readonly endDate: string
  readonly children: OrgGoalTree[]
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type TreeState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly roots: readonly OrgGoalTree[] }

const ORG_URL = '/api/goals/org'

const OWNER_TYPE_LABELS: Record<GoalOwnerType, string> = {
  ORGANIZATION: '組織',
  DEPARTMENT: '部門',
  TEAM: 'チーム',
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? []) as T
}

export default function GoalTreePage(): ReactElement {
  const [state, setState] = useState<TreeState>({ kind: 'loading' })

  useEffect(() => {
    const load = async () => {
      try {
        const roots = await fetchJson<OrgGoalTree[]>(`${ORG_URL}?tree=1`)
        const safeRoots = Array.isArray(roots) ? roots : []
        setState({ kind: 'ready', roots: safeRoots })
      } catch (err) {
        setState({ kind: 'error', message: readError(err) })
      }
    }
    void load()
  }, [])

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Goals</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">組織目標ツリー</h1>
        <p className="mt-2 text-sm text-slate-600">
          組織→部門→チームの多階層で設定された目標を確認できます。
        </p>
      </header>

      <TreeBody state={state} />
    </main>
  )
}

function TreeBody({ state }: { readonly state: TreeState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">データを読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">データの取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }
  if (state.roots.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        組織目標が登録されていません
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {state.roots.map((root) => (
        <GoalTreeNode key={root.id} node={root} depth={0} />
      ))}
    </div>
  )
}

function GoalTreeNode({
  node,
  depth,
}: {
  readonly node: OrgGoalTree
  readonly depth: number
}): ReactElement {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0
  const indentCls = depth === 0 ? '' : depth === 1 ? 'ml-6' : 'ml-12'

  return (
    <div className={indentCls}>
      <div
        className={`rounded-xl border bg-white p-4 shadow-sm ${
          depth === 0 ? 'border-indigo-200' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  node.ownerType === 'ORGANIZATION'
                    ? 'bg-indigo-100 text-indigo-700'
                    : node.ownerType === 'DEPARTMENT'
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-sky-100 text-sky-700'
                }`}
              >
                {OWNER_TYPE_LABELS[node.ownerType]}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  node.goalType === 'OKR'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {node.goalType}
              </span>
            </div>
            <p className="mt-1 font-semibold text-slate-900">{node.title}</p>
            {node.description && (
              <p className="mt-0.5 text-xs text-slate-500">{node.description}</p>
            )}
            {node.keyResult && (
              <p className="mt-1 text-xs text-slate-600">
                <span className="font-medium">KR:</span> {node.keyResult}
              </p>
            )}
            {node.targetValue !== null && (
              <p className="mt-0.5 text-xs text-slate-500">
                目標値: {node.targetValue} {node.unit ?? ''}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {node.startDate.slice(0, 10)} 〜 {node.endDate.slice(0, 10)}
            </p>
          </div>
          {hasChildren && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50"
            >
              {expanded ? '▲ 折りたたむ' : `▼ ${node.children.length} 件`}
            </button>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <GoalTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}
