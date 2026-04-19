/**
 * Issue #41 / Req 5.5: キャリア希望集計サービス
 *
 * - getDashboard: HR_MANAGER 向けのキャリア希望分布・充足予測ダッシュボード
 */
import {
  UNFULFILLED_TOP_ROLES_LIMIT,
  type CareerAggregateDashboard,
  type RoleWishDistribution,
} from './career-aggregate-types'

// ─────────────────────────────────────────────────────────────────────────────
// Repository port
// ─────────────────────────────────────────────────────────────────────────────

export interface WishRow {
  readonly userId: string
  readonly desiredRoleId: string
}

export interface RoleMasterRow {
  readonly id: string
  readonly name: string
}

export interface PositionRow {
  readonly roleId: string
  readonly holderUserId: string | null
}

export interface CareerAggregateRepository {
  listCurrentWishes(): Promise<WishRow[]>
  listRoleMasters(): Promise<RoleMasterRow[]>
  listPositions(): Promise<PositionRow[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface CareerAggregateService {
  getDashboard(): Promise<CareerAggregateDashboard>
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure computation helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildWishCountByRole(wishes: readonly WishRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const wish of wishes) {
    counts.set(wish.desiredRoleId, (counts.get(wish.desiredRoleId) ?? 0) + 1)
  }
  return counts
}

function buildHolderCountByRole(positions: readonly PositionRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const pos of positions) {
    if (pos.holderUserId === null) continue
    counts.set(pos.roleId, (counts.get(pos.roleId) ?? 0) + 1)
  }
  return counts
}

function buildRoleNameMap(roles: readonly RoleMasterRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const role of roles) {
    map.set(role.id, role.name)
  }
  return map
}

function computeFulfillmentRate(holderCount: number, wishCount: number): number {
  if (wishCount === 0) return 0
  return holderCount / wishCount
}

function buildDistribution(
  wishCounts: Map<string, number>,
  holderCounts: Map<string, number>,
  roleNames: Map<string, string>,
): RoleWishDistribution[] {
  return Array.from(wishCounts.entries()).map(([roleId, wishCount]) => ({
    roleId,
    roleName: roleNames.get(roleId) ?? 'Unknown',
    wishCount,
    fulfillmentRate: computeFulfillmentRate(holderCounts.get(roleId) ?? 0, wishCount),
  }))
}

function selectUnfulfilledTopRoles(
  distribution: readonly RoleWishDistribution[],
): readonly RoleWishDistribution[] {
  return [...distribution]
    .sort((a, b) => a.fulfillmentRate - b.fulfillmentRate)
    .slice(0, UNFULFILLED_TOP_ROLES_LIMIT)
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class CareerAggregateServiceImpl implements CareerAggregateService {
  private readonly repo: CareerAggregateRepository

  constructor(repo: CareerAggregateRepository) {
    this.repo = repo
  }

  async getDashboard(): Promise<CareerAggregateDashboard> {
    const [wishes, roles, positions] = await Promise.all([
      this.repo.listCurrentWishes(),
      this.repo.listRoleMasters(),
      this.repo.listPositions(),
    ])

    const wishCounts = buildWishCountByRole(wishes)
    const holderCounts = buildHolderCountByRole(positions)
    const roleNames = buildRoleNameMap(roles)

    const distribution = buildDistribution(wishCounts, holderCounts, roleNames)
    const unfulfilledTopRoles = selectUnfulfilledTopRoles(distribution)

    return {
      totalWishes: wishes.length,
      distribution,
      unfulfilledTopRoles,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createCareerAggregateService(
  repo: CareerAggregateRepository,
): CareerAggregateService {
  return new CareerAggregateServiceImpl(repo)
}
