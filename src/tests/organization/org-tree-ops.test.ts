/**
 * Issue #28 / Req 3.2, 3.4: org-tree-ops の純粋関数テスト
 *
 * - moveNode / wouldCreateCycle / applyOperations / hasStructuralDiff /
 *   countMembers / countDirectMembers / findNode / collectDescendantIds
 *
 * 全て入力 OrgTree を変更しないことも合わせて検証する (immutability)。
 */
import { describe, expect, it } from 'vitest'
import type { OrgNode, OrgTree } from '@/lib/organization/organization-types'
import { OrgChangeError } from '@/lib/organization/organization-types'
import {
  applyOperations,
  collectDescendantIds,
  countDirectMembers,
  countMembers,
  findNode,
  flattenNodes,
  hasStructuralDiff,
  moveNode,
  wouldCreateCycle,
} from '@/lib/organization/org-tree-ops'

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

function leaf(id: string, parentId: string | null, holders = 0): OrgNode {
  const positions = Array.from({ length: Math.max(holders, 1) }, (_, i) => ({
    id: `${id}-p-${i}`,
    roleId: 'ROLE',
    holderUserId: i < holders ? `${id}-u-${i}` : null,
    holderName: i < holders ? `user-${id}-${i}` : null,
  }))
  return { id, parentId, name: `node-${id}`, positions, children: [] }
}

function withChildren(node: OrgNode, children: ReadonlyArray<OrgNode>): OrgNode {
  return { ...node, children: children.map((c) => ({ ...c, parentId: node.id })) }
}

/**
 * a (1 holder)
 * ├── b (1 holder)
 * │   └── c (0 holder)
 * └── d (2 holders)
 */
function sampleTree(): OrgTree {
  const c = leaf('c', 'b', 0)
  const b = withChildren(leaf('b', 'a', 1), [c])
  const d = leaf('d', 'a', 2)
  const a = withChildren(leaf('a', null, 1), [b, d])
  return { roots: [a] }
}

// ─────────────────────────────────────────────────────────────────────────────
// findNode / flattenNodes / collectDescendantIds
// ─────────────────────────────────────────────────────────────────────────────

describe('findNode', () => {
  it('存在するノードを返す', () => {
    const tree = sampleTree()
    expect(findNode(tree, 'c')?.name).toBe('node-c')
  })
  it('存在しないノードは null', () => {
    expect(findNode(sampleTree(), 'zzz')).toBeNull()
  })
})

describe('flattenNodes', () => {
  it('全ノードを平坦化する', () => {
    const ids = flattenNodes(sampleTree()).map((n) => n.id)
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('collectDescendantIds', () => {
  it('自身は含めず子孫 id を返す', () => {
    const a = findNode(sampleTree(), 'a')
    expect(a).not.toBeNull()
    if (!a) return
    const ids = [...collectDescendantIds(a)].sort()
    expect(ids).toEqual(['b', 'c', 'd'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// countMembers
// ─────────────────────────────────────────────────────────────────────────────

describe('count members', () => {
  it('countDirectMembers は自ノードのホルダー数を返す', () => {
    const tree = sampleTree()
    const b = findNode(tree, 'b')
    expect(b).not.toBeNull()
    if (b) expect(countDirectMembers(b)).toBe(1)
  })
  it('countMembers は子孫のホルダー合計を返す', () => {
    const tree = sampleTree()
    const a = findNode(tree, 'a')
    expect(a).not.toBeNull()
    if (a) expect(countMembers(a)).toBe(4) // a:1 + b:1 + c:0 + d:2
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// wouldCreateCycle
// ─────────────────────────────────────────────────────────────────────────────

describe('wouldCreateCycle', () => {
  it('自身への移動は循環', () => {
    expect(wouldCreateCycle(sampleTree(), 'a', 'a')).toBe(true)
  })
  it('子孫への移動は循環', () => {
    expect(wouldCreateCycle(sampleTree(), 'a', 'c')).toBe(true)
  })
  it('ルートへの移動は循環しない', () => {
    expect(wouldCreateCycle(sampleTree(), 'b', null)).toBe(false)
  })
  it('親子関係にないノード同士は循環しない', () => {
    expect(wouldCreateCycle(sampleTree(), 'd', 'b')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// moveNode
// ─────────────────────────────────────────────────────────────────────────────

describe('moveNode', () => {
  it('別ノードの配下へ移動できる', () => {
    const tree = sampleTree()
    const next = moveNode(tree, 'd', 'b')
    const moved = findNode(next, 'd')
    expect(moved?.parentId).toBe('b')
    const a = findNode(next, 'a')
    expect(a?.children.map((c) => c.id)).toEqual(['b'])
  })

  it('ルートへ移動すると roots に追加される', () => {
    const tree = sampleTree()
    const next = moveNode(tree, 'b', null)
    expect(next.roots.map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect(findNode(next, 'b')?.parentId).toBeNull()
  })

  it('循環する移動は OrgChangeError(CYCLE_DETECTED)', () => {
    expect(() => moveNode(sampleTree(), 'a', 'c')).toThrowError(OrgChangeError)
    try {
      moveNode(sampleTree(), 'a', 'c')
    } catch (e) {
      expect(e).toBeInstanceOf(OrgChangeError)
      if (e instanceof OrgChangeError) expect(e.code).toBe('CYCLE_DETECTED')
    }
  })

  it('同じ親への移動は OrgChangeError(SAME_PARENT)', () => {
    try {
      moveNode(sampleTree(), 'b', 'a')
    } catch (e) {
      expect(e).toBeInstanceOf(OrgChangeError)
      if (e instanceof OrgChangeError) expect(e.code).toBe('SAME_PARENT')
    }
  })

  it('存在しないノードは OrgChangeError(NODE_NOT_FOUND)', () => {
    try {
      moveNode(sampleTree(), 'missing', 'a')
    } catch (e) {
      expect(e).toBeInstanceOf(OrgChangeError)
      if (e instanceof OrgChangeError) expect(e.code).toBe('NODE_NOT_FOUND')
    }
  })

  it('元のツリーは変更されない (immutable)', () => {
    const tree = sampleTree()
    const snapshot = JSON.stringify(tree)
    moveNode(tree, 'd', 'b')
    expect(JSON.stringify(tree)).toBe(snapshot)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// applyOperations / hasStructuralDiff
// ─────────────────────────────────────────────────────────────────────────────

describe('applyOperations', () => {
  it('複数の操作を順に適用する', () => {
    const tree = sampleTree()
    const next = applyOperations(tree, [
      { nodeId: 'd', newParentId: 'b' },
      { nodeId: 'c', newParentId: null },
    ])
    expect(findNode(next, 'd')?.parentId).toBe('b')
    expect(findNode(next, 'c')?.parentId).toBeNull()
  })

  it('途中でエラーが出たら throw', () => {
    expect(() => applyOperations(sampleTree(), [{ nodeId: 'a', newParentId: 'c' }])).toThrowError(
      OrgChangeError,
    )
  })
})

describe('hasStructuralDiff', () => {
  it('同じツリーなら false', () => {
    expect(hasStructuralDiff(sampleTree(), sampleTree())).toBe(false)
  })
  it('構造が違えば true', () => {
    const base = sampleTree()
    const moved = moveNode(base, 'd', 'b')
    expect(hasStructuralDiff(base, moved)).toBe(true)
  })
})
