/**
 * Issue #28 / Req 3.2, 3.4: 組織ツリー (OrgTree) に対する純粋な操作関数
 *
 * - findNode: ツリーから id でノードを探索
 * - flattenNodes: ツリー全体を平坦化 (id / parentId のマップ構築用)
 * - moveNode: ノードを別の親の下に移動し、新しいツリーを返す (immutable)
 * - wouldCreateCycle: 移動操作が循環参照になるかを事前判定
 * - collectDescendantIds: 子孫 id 集合を返す
 * - countMembers: ノード配下の総ホルダー数 (holderUserId != null) をカウント
 *
 * 全関数は入力を一切変更せず、必要な場合は新オブジェクトを返す。
 */
import type { OrgNode, OrgTree, OrgMoveOperation } from './organization-types'
import { OrgChangeError } from './organization-types'

// ─────────────────────────────────────────────────────────────────────────────
// 探索
// ─────────────────────────────────────────────────────────────────────────────

/** ツリーから id でノードを探索 (見つからなければ null) */
export function findNode(tree: OrgTree, nodeId: string): OrgNode | null {
  for (const root of tree.roots) {
    const found = findNodeRecursive(root, nodeId)
    if (found) return found
  }
  return null
}

function findNodeRecursive(node: OrgNode, nodeId: string): OrgNode | null {
  if (node.id === nodeId) return node
  for (const child of node.children) {
    const found = findNodeRecursive(child, nodeId)
    if (found) return found
  }
  return null
}

/** ツリーを平坦化した配列を返す */
export function flattenNodes(tree: OrgTree): ReadonlyArray<OrgNode> {
  const acc: OrgNode[] = []
  for (const root of tree.roots) {
    flattenRecursive(root, acc)
  }
  return acc
}

function flattenRecursive(node: OrgNode, acc: OrgNode[]): void {
  acc.push(node)
  for (const child of node.children) {
    flattenRecursive(child, acc)
  }
}

/** 指定ノード以下の子孫 id 集合を返す (自身は含めない) */
export function collectDescendantIds(node: OrgNode): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const child of node.children) {
    collectDescendantRecursive(child, ids)
  }
  return ids
}

function collectDescendantRecursive(node: OrgNode, ids: Set<string>): void {
  ids.add(node.id)
  for (const child of node.children) {
    collectDescendantRecursive(child, ids)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 循環参照検出
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 「nodeId を newParentId の下に移動する」操作が循環参照を生むかを判定。
 * - newParentId が null (ルート) は循環しない
 * - newParentId が nodeId 自身は循環
 * - newParentId が nodeId の子孫 (collectDescendantIds の要素) は循環
 */
export function wouldCreateCycle(
  tree: OrgTree,
  nodeId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false
  if (newParentId === nodeId) return true

  const node = findNode(tree, nodeId)
  if (!node) return false

  const descendants = collectDescendantIds(node)
  return descendants.has(newParentId)
}

// ─────────────────────────────────────────────────────────────────────────────
// メンバー数カウント
// ─────────────────────────────────────────────────────────────────────────────

/** ノード自身のポジションのうちホルダーが埋まっている件数 */
export function countDirectMembers(node: OrgNode): number {
  return node.positions.reduce((sum, p) => (p.holderUserId ? sum + 1 : sum), 0)
}

/** ノード以下すべての holderUserId 埋まり数 */
export function countMembers(node: OrgNode): number {
  let total = countDirectMembers(node)
  for (const child of node.children) {
    total += countMembers(child)
  }
  return total
}

// ─────────────────────────────────────────────────────────────────────────────
// 移動操作 (immutable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * nodeId を切り出し、newParentId の children に追加した新しいツリーを返す。
 * - newParentId が null のときはルートへ移動
 * - 循環参照が発生する場合は OrgChangeError を throw
 * - 既に newParentId の直下であれば OrgChangeError('SAME_PARENT') を throw
 */
export function moveNode(tree: OrgTree, nodeId: string, newParentId: string | null): OrgTree {
  const target = findNode(tree, nodeId)
  if (!target) {
    throw new OrgChangeError('NODE_NOT_FOUND', `Node not found: ${nodeId}`)
  }
  if (target.parentId === newParentId) {
    throw new OrgChangeError('SAME_PARENT', 'Node is already under the requested parent')
  }
  if (wouldCreateCycle(tree, nodeId, newParentId)) {
    throw new OrgChangeError('CYCLE_DETECTED', 'Move would create a cycle in the organization')
  }

  const detached = detachNode(tree, nodeId)
  const movedNode: OrgNode = { ...target, parentId: newParentId, children: target.children }

  if (newParentId === null) {
    return { roots: [...detached.roots, movedNode] }
  }
  const newRoots = detached.roots.map((r) => attachUnder(r, newParentId, movedNode))
  return { roots: newRoots }
}

/** nodeId をツリーから切り離した新しいツリーを返す */
function detachNode(tree: OrgTree, nodeId: string): OrgTree {
  const filteredRoots: OrgNode[] = []
  for (const root of tree.roots) {
    if (root.id === nodeId) continue
    filteredRoots.push(detachRecursive(root, nodeId))
  }
  return { roots: filteredRoots }
}

function detachRecursive(node: OrgNode, nodeId: string): OrgNode {
  const nextChildren: OrgNode[] = []
  for (const child of node.children) {
    if (child.id === nodeId) continue
    nextChildren.push(detachRecursive(child, nodeId))
  }
  return { ...node, children: nextChildren }
}

/** parentId の直下に newNode を追加した新しいノードを返す */
function attachUnder(node: OrgNode, parentId: string, newNode: OrgNode): OrgNode {
  if (node.id === parentId) {
    return { ...node, children: [...node.children, newNode] }
  }
  const nextChildren = node.children.map((c) => attachUnder(c, parentId, newNode))
  return { ...node, children: nextChildren }
}

// ─────────────────────────────────────────────────────────────────────────────
// 操作列の適用
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 操作列を順番に適用した新しいツリーを返す。
 * 途中でエラーが出たらその場で throw。
 */
export function applyOperations(
  tree: OrgTree,
  operations: ReadonlyArray<OrgMoveOperation>,
): OrgTree {
  let current = tree
  for (const op of operations) {
    current = moveNode(current, op.nodeId, op.newParentId)
  }
  return current
}

/**
 * 2 つのツリーの親子関係に差分があるかを判定 (プレビューで「変更あり」表示に使う)。
 * positions / name の変更は検知対象外。
 */
export function hasStructuralDiff(a: OrgTree, b: OrgTree): boolean {
  const mapA = buildParentMap(a)
  const mapB = buildParentMap(b)
  if (mapA.size !== mapB.size) return true
  for (const [id, parent] of mapA) {
    if (mapB.get(id) !== parent) return true
  }
  return false
}

function buildParentMap(tree: OrgTree): Map<string, string | null> {
  const map = new Map<string, string | null>()
  for (const node of flattenNodes(tree)) {
    map.set(node.id, node.parentId)
  }
  return map
}
