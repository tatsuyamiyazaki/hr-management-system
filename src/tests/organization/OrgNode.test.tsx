/**
 * Issue #28 / Req 3.1: OrgNodeCard レンダリング確認テスト
 *
 * jsdom / @testing-library/react は未導入のため、react-dom/server の
 * renderToString で SSR 相当の HTML を文字列として取得し、
 * - 部署名
 * - ポジション一覧 (ホルダー名 / 未配属)
 * - メンバー数 (合計 holderUserId 埋まり数)
 * が含まれることを確認する。
 *
 * ドラッグ&ドロップ自体の動作はこのテストのスコープ外 (E2E で検証する想定)。
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { OrgNodeCard } from '@/components/organization/OrgNode'
import type { OrgNode } from '@/lib/organization/organization-types'

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

function makeLeaf(id: string, name: string, holderName: string | null): OrgNode {
  return {
    id,
    name,
    parentId: null,
    children: [],
    positions: [
      {
        id: `${id}-pos-1`,
        roleId: 'ENGINEER',
        holderUserId: holderName ? `${id}-user` : null,
        holderName,
      },
    ],
  }
}

function makeTreeWithChildren(): OrgNode {
  const child1 = makeLeaf('child-1', 'フロントエンドチーム', '山田 太郎')
  const child2 = makeLeaf('child-2', 'バックエンドチーム', null)
  return {
    id: 'root-1',
    name: '開発部',
    parentId: null,
    positions: [
      {
        id: 'root-1-pos-1',
        roleId: 'DIRECTOR',
        holderUserId: 'root-1-user',
        holderName: '佐藤 花子',
      },
    ],
    children: [child1, child2],
  }
}

function noop(): void {
  // テスト用のダミー onX ハンドラ
}

// ─────────────────────────────────────────────────────────────────────────────
// テスト
// ─────────────────────────────────────────────────────────────────────────────

describe('OrgNodeCard rendering', () => {
  it('部署名を表示する', () => {
    const node = makeLeaf('n1', 'マーケティング部', '鈴木 一郎')
    const html = renderToString(
      <OrgNodeCard
        node={node}
        editable={false}
        draggingNodeId={null}
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={noop}
      />,
    )
    expect(html).toContain('マーケティング部')
  })

  it('ポジションのホルダー名が埋まっていれば表示する', () => {
    const node = makeLeaf('n2', '営業部', '田中 次郎')
    const html = renderToString(
      <OrgNodeCard
        node={node}
        editable={false}
        draggingNodeId={null}
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={noop}
      />,
    )
    expect(html).toContain('田中 次郎')
    expect(html).toContain('ENGINEER')
  })

  it('ホルダーがいない場合は「未配属」と表示する', () => {
    const node = makeLeaf('n3', '新規事業部', null)
    const html = renderToString(
      <OrgNodeCard
        node={node}
        editable={false}
        draggingNodeId={null}
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={noop}
      />,
    )
    expect(html).toContain('未配属')
  })

  it('子孫を含めた合計メンバー数 (ホルダー埋まり数) を表示する', () => {
    // root: 1 名 + child-1: 1 名 + child-2: 0 名 = 合計 2 名
    const node = makeTreeWithChildren()
    const html = renderToString(
      <OrgNodeCard
        node={node}
        editable={false}
        draggingNodeId={null}
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={noop}
      />,
    )
    // React SSR はテキストノード間にコメントマーカーを挿入するため正規表現で照合
    expect(html).toMatch(/メンバー\s(?:<!--\s*-->)?2(?:<!--\s*-->)?\s名/)
  })

  it('editable=false のときはドラッグハンドルを表示しない', () => {
    const node = makeLeaf('n4', 'サポート部', '伊藤 三郎')
    const html = renderToString(
      <OrgNodeCard
        node={node}
        editable={false}
        draggingNodeId={null}
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={noop}
      />,
    )
    expect(html).not.toContain('ドラッグして上長を変更')
  })

  it('editable=true のときはドラッグハンドルを表示する', () => {
    const node = makeLeaf('n5', '財務部', '高橋 四郎')
    const html = renderToString(
      <OrgNodeCard
        node={node}
        editable={true}
        draggingNodeId={null}
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={noop}
      />,
    )
    expect(html).toContain('ドラッグして上長を変更')
  })

  it('子ノードも再帰的に表示される (デフォルト展開)', () => {
    const node = makeTreeWithChildren()
    const html = renderToString(
      <OrgNodeCard
        node={node}
        editable={false}
        draggingNodeId={null}
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={noop}
      />,
    )
    expect(html).toContain('開発部')
    expect(html).toContain('フロントエンドチーム')
    expect(html).toContain('バックエンドチーム')
  })

  it('defaultExpanded=false のときは子ノードを描画しない', () => {
    const node = makeTreeWithChildren()
    const html = renderToString(
      <OrgNodeCard
        node={node}
        editable={false}
        draggingNodeId={null}
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={noop}
        defaultExpanded={false}
      />,
    )
    expect(html).toContain('開発部')
    expect(html).not.toContain('フロントエンドチーム')
    expect(html).not.toContain('バックエンドチーム')
  })
})
