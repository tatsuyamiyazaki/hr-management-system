/**
 * Issue #28 / Req 3.1: 組織ノードコンポーネント
 *
 * 単一ノードの描画を担当。
 * - 部署名 / メンバー数 / ポジション一覧を表示
 * - クリックで展開 / 折りたたみ
 * - editable=true (HR_MANAGER) のときだけドラッグハンドルを描画
 * - ドロップ対象として children を受け付け、isDropTarget で視覚フィードバック
 */
'use client'

import { useState, type DragEvent, type KeyboardEvent, type ReactElement } from 'react'
import type { OrgNode as OrgNodeType } from '@/lib/organization/organization-types'
import { countMembers } from '@/lib/organization/org-tree-ops'

interface OrgNodeCardProps {
  readonly node: OrgNodeType
  readonly editable: boolean
  readonly draggingNodeId: string | null
  readonly onDragStart: (nodeId: string) => void
  readonly onDragEnd: () => void
  readonly onDropOn: (targetId: string) => void
  readonly defaultExpanded?: boolean
}

/**
 * 再帰的に子ノードを描画する組織図カード。
 * 自ノードの表示と、ドロップエリア / 子リストを一緒に管理する。
 */
export function OrgNodeCard(props: OrgNodeCardProps): ReactElement {
  const { node, editable, draggingNodeId, onDragStart, onDragEnd, onDropOn, defaultExpanded } =
    props
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded ?? true)
  const [isHovered, setIsHovered] = useState<boolean>(false)
  const hasChildren = node.children.length > 0
  const totalMembers = countMembers(node)
  const beingDragged = draggingNodeId === node.id
  const isValidTarget = editable && draggingNodeId !== null && draggingNodeId !== node.id

  function toggle(): void {
    setExpanded((v) => !v)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>): void {
    if (!editable) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/org-node-id', node.id)
    onDragStart(node.id)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!isValidTarget) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setIsHovered(true)
  }

  function handleDragLeave(): void {
    setIsHovered(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsHovered(false)
    if (!isValidTarget) return
    onDropOn(node.id)
  }

  return (
    <li className="relative">
      <div
        draggable={editable}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={`org-node-${node.id}`}
        className={buildCardClass({ beingDragged, isHovered, isValidTarget })}
      >
        <NodeHeader
          node={node}
          editable={editable}
          expanded={expanded}
          hasChildren={hasChildren}
          totalMembers={totalMembers}
          onToggle={toggle}
          onHeaderKey={onKeyDown}
        />
        {node.positions.length > 0 && <PositionList positions={node.positions} />}
      </div>

      {hasChildren && expanded && (
        <ul className="mt-3 ml-6 space-y-3 border-l border-dashed border-slate-300 pl-6">
          {node.children.map((child) => (
            <OrgNodeCard
              key={child.id}
              node={child}
              editable={editable}
              draggingNodeId={draggingNodeId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropOn={onDropOn}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部: カードのクラス組み立て
// ─────────────────────────────────────────────────────────────────────────────

interface BuildCardClassOptions {
  readonly beingDragged: boolean
  readonly isHovered: boolean
  readonly isValidTarget: boolean
}

function buildCardClass(opts: BuildCardClassOptions): string {
  const base =
    'group w-72 rounded-lg border bg-white px-4 py-3 shadow-sm transition-all duration-150'
  if (opts.beingDragged) {
    return `${base} border-amber-400 opacity-40 ring-2 ring-amber-200`
  }
  if (opts.isHovered && opts.isValidTarget) {
    return `${base} border-dashed border-2 border-emerald-500 bg-emerald-50 shadow-md`
  }
  return `${base} border-slate-200 hover:border-slate-400 hover:shadow-md`
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部: ヘッダ
// ─────────────────────────────────────────────────────────────────────────────

interface NodeHeaderProps {
  readonly node: OrgNodeType
  readonly editable: boolean
  readonly expanded: boolean
  readonly hasChildren: boolean
  readonly totalMembers: number
  readonly onToggle: () => void
  readonly onHeaderKey: (event: KeyboardEvent<HTMLButtonElement>) => void
}

function NodeHeader(props: NodeHeaderProps): ReactElement {
  const { node, editable, expanded, hasChildren, totalMembers, onToggle, onHeaderKey } = props
  return (
    <div className="flex items-start gap-2">
      {editable && (
        <span
          aria-hidden="true"
          className="mt-1 shrink-0 cursor-grab text-slate-400 select-none group-active:cursor-grabbing"
          title="ドラッグして上長を変更"
        >
          ⋮⋮
        </span>
      )}
      <button
        type="button"
        onClick={onToggle}
        onKeyDown={onHeaderKey}
        aria-expanded={expanded}
        className="flex-1 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-900">{node.name}</span>
          {hasChildren && (
            <span className="text-xs text-slate-500" aria-hidden="true">
              {expanded ? '▼' : '▶'}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          メンバー {totalMembers} 名 / ポジション {node.positions.length} 件
        </div>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部: ポジション一覧
// ─────────────────────────────────────────────────────────────────────────────

interface PositionListProps {
  readonly positions: OrgNodeType['positions']
}

function PositionList(props: PositionListProps): ReactElement {
  return (
    <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
      {props.positions.map((p) => (
        <li key={p.id} className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-600">{p.roleId}</span>
          <span className={p.holderName ? 'text-slate-800' : 'text-slate-400 italic'}>
            {p.holderName ?? '未配属'}
          </span>
        </li>
      ))}
    </ul>
  )
}
