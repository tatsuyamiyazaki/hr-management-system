/**
 * Issue #28 / Req 3.1, 3.2: 組織管理画面 (HR_MANAGER 向け)
 *
 * - マウント時に GET /api/organization/tree を取得
 * - OrganizationChart でインタラクティブにドラッグ&ドロップ
 * - 変更差分があるときだけ「変更をプレビュー」「確定」ボタンを活性化
 * - 確定時は POST /api/organization/commit で operations を送信
 *
 * HR_MANAGER 以外のアクセスはサーバ側で弾かれる想定。UI 側は role を
 * クライアント状態として受け取り、編集可否 (editable) を切り替える。
 */
'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type {
  OrgTree,
  OrgMoveOperation,
  OrgCommitResponse,
} from '@/lib/organization/organization-types'
import { OrgChangeError } from '@/lib/organization/organization-types'
import { hasStructuralDiff, flattenNodes } from '@/lib/organization/org-tree-ops'
import { OrganizationChart } from '@/components/organization/OrganizationChart'

interface OrgTreeEnvelope {
  readonly success?: boolean
  readonly data?: OrgTree
  readonly error?: string
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly original: OrgTree; readonly current: OrgTree }

type CommitState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'success'; readonly applied: number }
  | { readonly kind: 'error'; readonly message: string }

const ORG_TREE_URL = '/api/organization/tree'
const ORG_COMMIT_URL = '/api/organization/commit'

export default function OrganizationPage(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [commitState, setCommitState] = useState<CommitState>({ kind: 'idle' })
  const [dragError, setDragError] = useState<string | null>(null)
  // HR_MANAGER role を仮定 (実際のユーザロール判定は認証層が行う想定)
  const editable = true

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(ORG_TREE_URL, { cache: 'no-store' })
        const payload = ((await res.json().catch(() => ({}))) ?? {}) as OrgTreeEnvelope
        if (!res.ok || !payload.data) {
          throw new Error(payload.error ?? `Failed to load org tree: ${res.status}`)
        }
        const tree = payload.data
        if (cancelled) return
        setLoadState({ kind: 'ready', original: tree, current: tree })
      } catch (err) {
        if (cancelled) return
        setLoadState({ kind: 'error', message: readError(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleTreeChange = useCallback((next: OrgTree) => {
    setLoadState((prev) => (prev.kind === 'ready' ? { ...prev, current: next } : prev))
    setCommitState({ kind: 'idle' })
    setDragError(null)
  }, [])

  const handleDragError = useCallback((err: OrgChangeError) => {
    setDragError(translateOrgChangeError(err))
  }, [])

  const handleReset = useCallback(() => {
    setLoadState((prev) => (prev.kind === 'ready' ? { ...prev, current: prev.original } : prev))
    setCommitState({ kind: 'idle' })
    setDragError(null)
  }, [])

  const handleCommit = useCallback(async () => {
    if (loadState.kind !== 'ready') return
    const operations = diffOperations(loadState.original, loadState.current)
    if (operations.length === 0) return
    setCommitState({ kind: 'saving' })
    try {
      const body = JSON.stringify({ operations })
      const res = await fetch(ORG_COMMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) {
        const msg = await readServerError(res)
        throw new Error(msg)
      }
      const payload = (await res.json()) as OrgCommitResponse
      setCommitState({ kind: 'success', applied: payload.appliedOperations })
      setLoadState((prev) => (prev.kind === 'ready' ? { ...prev, original: prev.current } : prev))
    } catch (err) {
      setCommitState({ kind: 'error', message: readError(err) })
    }
  }, [loadState])

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Header />
      <PageBody
        loadState={loadState}
        commitState={commitState}
        dragError={dragError}
        editable={editable}
        onTreeChange={handleTreeChange}
        onDragError={handleDragError}
        onReset={handleReset}
        onCommit={handleCommit}
      />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// サブコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

function Header(): ReactElement {
  return (
    <header className="mb-8">
      <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
        Organization
      </p>
      <h1 className="mt-1 text-3xl font-bold text-slate-900">組織管理</h1>
      <p className="mt-2 text-sm text-slate-600">
        ノードをドラッグ&ドロップして組織構造を編集できます。変更は確定するまで保存されません。
      </p>
    </header>
  )
}

interface PageBodyProps {
  readonly loadState: LoadState
  readonly commitState: CommitState
  readonly dragError: string | null
  readonly editable: boolean
  readonly onTreeChange: (t: OrgTree) => void
  readonly onDragError: (err: OrgChangeError) => void
  readonly onReset: () => void
  readonly onCommit: () => void
}

function PageBody(props: PageBodyProps): ReactElement {
  const { loadState } = props
  if (loadState.kind === 'loading') return <LoadingCard />
  if (loadState.kind === 'error') return <ErrorCard message={loadState.message} />

  const changed = hasStructuralDiff(loadState.original, loadState.current)
  const pendingOps = diffOperations(loadState.original, loadState.current)

  return (
    <section className="space-y-6">
      <Toolbar
        changed={changed}
        commitState={props.commitState}
        pendingCount={pendingOps.length}
        onReset={props.onReset}
        onCommit={props.onCommit}
      />
      {props.dragError && <InlineBanner tone="error" message={props.dragError} />}
      {changed && (
        <InlineBanner
          tone="info"
          message={`未確定の変更が ${pendingOps.length} 件あります。内容を確認して確定してください。`}
        />
      )}
      <OrganizationChart
        tree={loadState.current}
        editable={props.editable}
        onTreeChange={props.onTreeChange}
        onError={props.onDragError}
      />
    </section>
  )
}

function LoadingCard(): ReactElement {
  return (
    <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
      <span className="animate-pulse">組織データを読み込み中…</span>
    </div>
  )
}

interface ErrorCardProps {
  readonly message: string
}

function ErrorCard(props: ErrorCardProps): ReactElement {
  return (
    <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
      <p className="font-semibold">組織データの取得に失敗しました</p>
      <p className="mt-1 text-xs">{props.message}</p>
    </div>
  )
}

interface ToolbarProps {
  readonly changed: boolean
  readonly commitState: CommitState
  readonly pendingCount: number
  readonly onReset: () => void
  readonly onCommit: () => void
}

function Toolbar(props: ToolbarProps): ReactElement {
  const saving = props.commitState.kind === 'saving'
  const disabledCommit = !props.changed || saving
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-600">
        {props.changed ? `変更あり (${props.pendingCount} 件)` : '変更はありません'}
        {props.commitState.kind === 'success' && (
          <span className="ml-2 font-semibold text-emerald-600">
            ✓ {props.commitState.applied} 件の変更を保存しました
          </span>
        )}
        {props.commitState.kind === 'error' && (
          <span className="ml-2 font-semibold text-rose-600">
            保存失敗: {props.commitState.message}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onReset}
          disabled={!props.changed || saving}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          変更を破棄
        </button>
        <button
          type="button"
          onClick={props.onCommit}
          disabled={disabledCommit}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? '保存中…' : '変更を確定'}
        </button>
      </div>
    </div>
  )
}

interface BannerProps {
  readonly tone: 'info' | 'error'
  readonly message: string
}

function InlineBanner(props: BannerProps): ReactElement {
  const cls =
    props.tone === 'error'
      ? 'border-rose-300 bg-rose-50 text-rose-800'
      : 'border-indigo-200 bg-indigo-50 text-indigo-800'
  return (
    <div className={`rounded-lg border ${cls} px-4 py-3 text-xs font-medium`}>{props.message}</div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 差分 → 操作列
// ─────────────────────────────────────────────────────────────────────────────

/** original → current の差分から OrgMoveOperation の配列を生成 */
function diffOperations(original: OrgTree, current: OrgTree): ReadonlyArray<OrgMoveOperation> {
  const origParents = new Map<string, string | null>()
  for (const n of flattenNodes(original)) origParents.set(n.id, n.parentId)
  const ops: OrgMoveOperation[] = []
  for (const n of flattenNodes(current)) {
    const before = origParents.get(n.id)
    if (before === undefined) continue
    if (before !== n.parentId) {
      ops.push({ nodeId: n.id, newParentId: n.parentId })
    }
  }
  return ops
}

// ─────────────────────────────────────────────────────────────────────────────
// エラー整形
// ─────────────────────────────────────────────────────────────────────────────

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

async function readServerError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { readonly error?: string }
    if (typeof body.error === 'string') return body.error
  } catch {
    // noop
  }
  return `HTTP ${res.status}`
}

function translateOrgChangeError(err: OrgChangeError): string {
  switch (err.code) {
    case 'CYCLE_DETECTED':
      return '循環参照が発生するため、この移動はできません。'
    case 'NODE_NOT_FOUND':
      return '対象のノードが見つかりません。'
    case 'SAME_PARENT':
      return '既にその上長の配下にあります。'
    case 'INVALID_OPERATION':
      return '不正な操作です。'
    default:
      return err.message
  }
}
