/**
 * Issue #41 / Req 5.5: キャリア希望集計ダッシュボードの型定義
 */

export interface RoleWishDistribution {
  readonly roleId: string
  readonly roleName: string
  readonly wishCount: number
  readonly fulfillmentRate: number
}

export interface CareerAggregateDashboard {
  readonly totalWishes: number
  readonly distribution: readonly RoleWishDistribution[]
  readonly unfulfilledTopRoles: readonly RoleWishDistribution[]
}

export const UNFULFILLED_TOP_ROLES_LIMIT = 5
