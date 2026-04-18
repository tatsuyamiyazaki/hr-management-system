/**
 * Issue #28 / Req 3.1, 3.2, 3.5: 組織図 UI 向け型定義
 *
 * - OrgTree / OrgNode / OrgPosition: API `/api/organization/tree` レスポンス形状
 * - OrgMoveOperation: ドラッグ&ドロップで発生したノード移動情報
 * - OrgPreviewResponse / OrgCommitResponse: プレビュー / 確定 API のレスポンス
 *
 * 設計方針:
 * - UI 側は OrgTree を受け取り、immutable に更新しながらプレビューを構築する
 * - 循環参照 (Req 3.4) は Service 層でも検出するが、UI でも pre-check する
 */

// ─────────────────────────────────────────────────────────────────────────────
// OrgTree 構造体
// ─────────────────────────────────────────────────────────────────────────────

/** ポジション (役職) */
export interface OrgPosition {
  readonly id: string
  readonly roleId: string
  readonly holderUserId: string | null
  readonly holderName: string | null
}

/** 組織ノード (部署 / チーム) */
export interface OrgNode {
  readonly id: string
  readonly name: string
  readonly parentId: string | null
  readonly positions: ReadonlyArray<OrgPosition>
  readonly children: ReadonlyArray<OrgNode>
}

/** 組織ツリールート集合 */
export interface OrgTree {
  readonly roots: ReadonlyArray<OrgNode>
}

// ─────────────────────────────────────────────────────────────────────────────
// 操作・プレビュー
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ノード移動操作。
 * parentId が null のときは "ルートへ移動" を意味する。
 */
export interface OrgMoveOperation {
  readonly nodeId: string
  readonly newParentId: string | null
}

/** プレビュー API リクエストボディ */
export interface OrgPreviewRequest {
  readonly operations: ReadonlyArray<OrgMoveOperation>
}

/**
 * プレビュー API レスポンス。
 * valid=false の場合は reason に人間可読な理由 (循環参照 など) が入る。
 */
export interface OrgPreviewResponse {
  readonly valid: boolean
  readonly reason?: string
  readonly tree: OrgTree
}

/** 確定 API レスポンス */
export interface OrgCommitResponse {
  readonly success: boolean
  readonly appliedOperations: number
}

// ─────────────────────────────────────────────────────────────────────────────
// ドメインエラー (UI 表示用の分類)
// ─────────────────────────────────────────────────────────────────────────────

export type OrgChangeErrorCode =
  | 'CYCLE_DETECTED'
  | 'NODE_NOT_FOUND'
  | 'SAME_PARENT'
  | 'INVALID_OPERATION'

export class OrgChangeError extends Error {
  public readonly code: OrgChangeErrorCode

  constructor(code: OrgChangeErrorCode, message: string) {
    super(message)
    this.name = 'OrgChangeError'
    this.code = code
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGER 向け直属メンバー
// ─────────────────────────────────────────────────────────────────────────────

/** 直属メンバー情報 (MANAGER の my-team 画面用) */
export interface DirectReport {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly roleName: string
  readonly departmentName: string
}

export interface MyTeamResponse {
  readonly managerName: string
  readonly departmentName: string
  readonly directReports: ReadonlyArray<DirectReport>
}
