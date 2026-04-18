/**
 * Issue #28 / Req 3.1, 3.2: 組織図 (インタラクティブ DnD) コンポーネント
 *
 * - HTML5 DnD API を使用 (外部依存なし)
 * - 編集可能 (editable=HR_MANAGER) のときだけドラッグを許可
 * - ドラッグ&ドロップ発生時、moveNode / wouldCreateCycle で循環判定を行い
 *   新しいツリーを親に通知 (onTreeChange)
 * - ツリー空エリアへのドロップは "ルートへの移動" として扱う
 */
'use client'

import { useState, useCallback, type DragEvent, type ReactElement } from 'react'
import type { OrgTree } from '@/lib/organization/organization-types'
import { OrgChangeError } from '@/lib/organization/organization-types'
import { moveNode } from '@/lib/organization/org-tree-ops'
import { OrgNodeCard } from './OrgNode'

interface OrganizationChartProps {
  readonly tree: OrgTree
  readonly editable: boolean
  readonly onTreeChange: (nextTree: OrgTree) => void
  readonly onError?: (error: OrgChangeError) => void
}

/**
 * 組織図ルートコンポーネント。ルートノード群を横に並べる。
 * ツリー操作のオーケストレーションを担当する。
 */
export function OrganizationChart(props: OrganizationChartProps): ReactElement {
  const { tree, editable, onTreeChange, onError } = props
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [rootHover, setRootHover] = useState<boolean>(false)

  const handleDragStart = useCallback((nodeId: string) => {
    setDraggingNodeId(nodeId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingNodeId(null)
    setRootHover(false)
  }, [])

  const applyMove = useCallback(
    (nodeId: string, newParentId: string | null) => {
      try {
        const nextTree = moveNode(tree, nodeId, newParentId)
        onTreeChange(nextTree)
      } catch (err) {
        if (err instanceof OrgChangeError) {
          onError?.(err)
        } else {
          throw err
        }
      } finally {
        setDraggingNodeId(null)
        setRootHover(false)
      }
    },
    [tree, onTreeChange, onError],
  )

  const handleDropOnNode = useCallback(
    (targetId: string) => {
      if (!draggingNodeId) return
      applyMove(draggingNodeId, targetId)
    },
    [draggingNodeId, applyMove],
  )

  function handleRootDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!editable || !draggingNodeId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setRootHover(true)
  }

  function handleRootDragLeave(event: DragEvent<HTMLDivElement>): void {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setRootHover(false)
  }

  function handleRootDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setRootHover(false)
    if (!draggingNodeId) return
    if (event.target !== event.currentTarget) return
    applyMove(draggingNodeId, null)
  }

  const rootClass = buildRootClass({
    editable,
    dragging: draggingNodeId !== null,
    rootHover,
  })

  return (
    <div
      data-testid="organization-chart"
      className={rootClass}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      {tree.roots.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-wrap gap-6">
          {tree.roots.map((root) => (
            <OrgNodeCard
              key={root.id}
              node={root}
              editable={editable}
              draggingNodeId={draggingNodeId}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDropOn={handleDropOnNode}
            />
          ))}
        </ul>
      )}
      {editable && draggingNodeId && (
        <p className="mt-4 text-xs text-slate-500">
          カードをドロップして親部署を変更。空白エリアに落とすとルートへ移動します。
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

interface RootClassOptions {
  readonly editable: boolean
  readonly dragging: boolean
  readonly rootHover: boolean
}

function buildRootClass(opts: RootClassOptions): string {
  const base = 'w-full rounded-xl bg-slate-50 p-6 transition-colors duration-150'
  if (opts.editable && opts.dragging) {
    return `${base} border-2 border-dashed ${
      opts.rootHover ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'
    }`
  }
  return `${base} border border-slate-200`
}

function EmptyState(): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <p className="text-sm">組織データがまだ登録されていません。</p>
    </div>
  )
}
