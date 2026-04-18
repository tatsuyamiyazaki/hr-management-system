/**
 * Issue #27 / Req 3.4: 組織階層の循環参照検出 (純粋関数)
 *
 * DFS で parent / supervisor を辿り、自己参照が発生したら循環パスを返す。
 * - 入力は Map<nodeId, parentId | null> として受け取り、DB 依存を持たない
 * - サービス層からは「適用後の状態」を作ってから呼ぶ (プレビュー / コミット共通)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** 親ポインタマップ: nodeId -> parentId (null はルート) */
export type ParentMap = ReadonlyMap<string, string | null>

/** 循環検出結果 */
export type CycleCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly path: readonly string[] }

// ─────────────────────────────────────────────────────────────────────────────
// DFS 実装
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DEPTH = 10_000

/**
 * 1 ノードから親方向に辿り、循環が無いかを検査する。
 * - 既に検査済 (visited) のノードに到達したら打ち切り
 * - 経路 (path) に同一 ID が再登場したら循環
 */
function walkFromNode(
  start: string,
  parentMap: ParentMap,
  globallyVisited: Set<string>,
): CycleCheckResult {
  const path: string[] = []
  const inPath = new Set<string>()
  let current: string | null | undefined = start
  let depth = 0

  while (current !== null && current !== undefined) {
    if (depth++ > MAX_DEPTH) {
      return { ok: false, path: [...path, current, '...truncated'] }
    }
    if (inPath.has(current)) {
      const cycleStart = path.indexOf(current)
      const cyclePath = path.slice(cycleStart).concat(current)
      return { ok: false, path: cyclePath }
    }
    if (globallyVisited.has(current)) {
      break
    }
    path.push(current)
    inPath.add(current)
    current = parentMap.get(current) ?? null
  }

  for (const id of path) {
    globallyVisited.add(id)
  }
  return { ok: true }
}

/**
 * parentMap 全体に循環が無いか検査する純粋関数。
 *
 * @returns サイクルがあれば ok=false & 循環パス、なければ ok=true
 */
export function detectCycle(parentMap: ParentMap): CycleCheckResult {
  const globallyVisited = new Set<string>()
  for (const nodeId of parentMap.keys()) {
    if (globallyVisited.has(nodeId)) continue
    const result = walkFromNode(nodeId, parentMap, globallyVisited)
    if (!result.ok) return result
  }
  return { ok: true }
}
