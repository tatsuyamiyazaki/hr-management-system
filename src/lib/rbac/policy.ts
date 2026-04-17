/**
 * デフォルト RBAC ポリシー
 *
 * Task 6.3 — HR 人事管理システムの主要リソースに対するデフォルト認可ルール。
 * 新規リソースタイプはここに追加する。
 *
 * 関連要件:
 * - Req 1.8: HR_MANAGER ロールは全社員の評価・配置・目標データへの読み取り権限
 * - Req 1.9: EMPLOYEE ロールは他の社員の個人評価データへアクセスすると 403
 */
import type { PolicyRule } from './rbac-types'

/**
 * 本プロダクトのデフォルトポリシー。
 *
 * 方針:
 * - ADMIN は全操作を許可 (明示的に allowedRoles に含める)
 * - HR_MANAGER は人事データの READ/UPDATE を広く許可、DELETE は ADMIN のみ
 * - MANAGER は 1on1 など部下向け操作のみ
 * - EMPLOYEE は自分のデータへの READ/UPDATE を `ownerCanAccess: true` で許可
 *
 * 新しいリソースを追加する際は、EMPLOYEE が自分のデータを操作できるかを
 * 最初に検討し、必要なら ownerCanAccess を true にすること。
 */
export const DEFAULT_POLICY_RULES: readonly PolicyRule[] = [
  // ─── EVALUATION (評価) — Req 1.8 / 1.9 ──────────────────────────────────
  // READ: ADMIN / HR_MANAGER は全件、本人は自分の分のみ
  {
    resourceType: 'EVALUATION',
    action: 'READ',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
    ownerCanAccess: true,
  },
  // CREATE: 全ロールが自分の評価を作成可能
  {
    resourceType: 'EVALUATION',
    action: 'CREATE',
    allowedRoles: ['ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'],
  },
  // UPDATE: ADMIN / HR_MANAGER は全件、本人は自分の分のみ
  {
    resourceType: 'EVALUATION',
    action: 'UPDATE',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
    ownerCanAccess: true,
  },
  // DELETE: ADMIN のみ
  {
    resourceType: 'EVALUATION',
    action: 'DELETE',
    allowedRoles: ['ADMIN'],
  },

  // ─── GOAL (目標) — Req 1.8 ───────────────────────────────────────────────
  {
    resourceType: 'GOAL',
    action: 'READ',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
    ownerCanAccess: true,
  },
  {
    resourceType: 'GOAL',
    action: 'CREATE',
    allowedRoles: ['ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'],
  },
  {
    resourceType: 'GOAL',
    action: 'UPDATE',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
    ownerCanAccess: true,
  },
  {
    resourceType: 'GOAL',
    action: 'DELETE',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
    ownerCanAccess: true,
  },

  // ─── POSITION (配置) — Req 1.8 ───────────────────────────────────────────
  {
    resourceType: 'POSITION',
    action: 'READ',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
  },

  // ─── PROFILE (プロフィール) ─────────────────────────────────────────────
  {
    resourceType: 'PROFILE',
    action: 'READ',
    allowedRoles: ['ADMIN', 'HR_MANAGER', 'MANAGER'],
    ownerCanAccess: true,
  },
  {
    resourceType: 'PROFILE',
    action: 'UPDATE',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
    ownerCanAccess: true,
  },

  // ─── ONE_ON_ONE (1on1) — 上長 + HR + ADMIN ─────────────────────────────
  {
    resourceType: 'ONE_ON_ONE',
    action: 'READ',
    allowedRoles: ['ADMIN', 'HR_MANAGER', 'MANAGER'],
    ownerCanAccess: true,
  },
  {
    resourceType: 'ONE_ON_ONE',
    action: 'CREATE',
    allowedRoles: ['ADMIN', 'HR_MANAGER', 'MANAGER'],
  },
  {
    resourceType: 'ONE_ON_ONE',
    action: 'UPDATE',
    allowedRoles: ['ADMIN', 'HR_MANAGER', 'MANAGER'],
  },

  // ─── マスタデータ / 組織 ─────────────────────────────────────────────
  {
    resourceType: 'MASTER_DATA',
    action: 'MANAGE',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
  },
  {
    resourceType: 'ORGANIZATION',
    action: 'MANAGE',
    allowedRoles: ['ADMIN', 'HR_MANAGER'],
  },

  // ─── 監査ログ / システム設定 (ADMIN のみ) ───────────────────────────
  {
    resourceType: 'AUDIT_LOG',
    action: 'READ',
    allowedRoles: ['ADMIN'],
  },
  {
    resourceType: 'SYSTEM_CONFIG',
    action: 'MANAGE',
    allowedRoles: ['ADMIN'],
  },
] as const
