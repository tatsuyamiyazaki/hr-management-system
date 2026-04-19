/**
 * Issue #41 / Req 5.5: CareerAggregateService 単体テスト
 *
 * - getDashboard: 分布計算、充足予測計算、unfulfilledTopRoles ソート
 */
import { describe, it, expect } from 'vitest'
import { createCareerAggregateService } from '@/lib/career/career-aggregate-service'
import type { CareerAggregateRepository } from '@/lib/career/career-aggregate-service'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<CareerAggregateRepository> = {}): CareerAggregateRepository {
  return {
    listCurrentWishes: async () => [],
    listRoleMasters: async () => [],
    listPositions: async () => [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CareerAggregateService.getDashboard', () => {
  describe('分布計算', () => {
    it('希望がない場合は空のダッシュボードを返す', async () => {
      const svc = createCareerAggregateService(makeRepo())

      const result = await svc.getDashboard()

      expect(result.totalWishes).toBe(0)
      expect(result.distribution).toEqual([])
      expect(result.unfulfilledTopRoles).toEqual([])
    })

    it('同じロールへの希望者を正しくカウントする', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [
          { userId: 'u1', desiredRoleId: 'role-a' },
          { userId: 'u2', desiredRoleId: 'role-a' },
          { userId: 'u3', desiredRoleId: 'role-b' },
        ],
        listRoleMasters: async () => [
          { id: 'role-a', name: 'Senior Engineer' },
          { id: 'role-b', name: 'Tech Lead' },
        ],
        listPositions: async () => [],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      expect(result.totalWishes).toBe(3)
      const roleA = result.distribution.find((d) => d.roleId === 'role-a')
      const roleB = result.distribution.find((d) => d.roleId === 'role-b')
      expect(roleA?.wishCount).toBe(2)
      expect(roleA?.roleName).toBe('Senior Engineer')
      expect(roleB?.wishCount).toBe(1)
      expect(roleB?.roleName).toBe('Tech Lead')
    })

    it('ロール名が存在しない roleId は "Unknown" として扱う', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [{ userId: 'u1', desiredRoleId: 'role-unknown' }],
        listRoleMasters: async () => [],
        listPositions: async () => [],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      const entry = result.distribution.find((d) => d.roleId === 'role-unknown')
      expect(entry?.roleName).toBe('Unknown')
    })
  })

  describe('充足予測計算', () => {
    it('そのロールに就いている人数 / 希望者数 で充足率を計算する', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [
          { userId: 'u1', desiredRoleId: 'role-a' },
          { userId: 'u2', desiredRoleId: 'role-a' },
          { userId: 'u3', desiredRoleId: 'role-a' },
          { userId: 'u4', desiredRoleId: 'role-a' },
        ],
        listRoleMasters: async () => [{ id: 'role-a', name: 'Senior Engineer' }],
        listPositions: async () => [
          { roleId: 'role-a', holderUserId: 'u10' },
          { roleId: 'role-a', holderUserId: 'u11' },
        ],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      const roleA = result.distribution.find((d) => d.roleId === 'role-a')
      expect(roleA?.fulfillmentRate).toBeCloseTo(0.5)
    })

    it('希望者が 0 のロールは充足率 0 とする', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [],
        listRoleMasters: async () => [{ id: 'role-a', name: 'Senior Engineer' }],
        listPositions: async () => [{ roleId: 'role-a', holderUserId: 'u1' }],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      expect(result.distribution).toHaveLength(0)
    })

    it('そのロールに誰も就いていない場合は充足率 0 とする', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [
          { userId: 'u1', desiredRoleId: 'role-a' },
          { userId: 'u2', desiredRoleId: 'role-a' },
        ],
        listRoleMasters: async () => [{ id: 'role-a', name: 'Senior Engineer' }],
        listPositions: async () => [],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      const roleA = result.distribution.find((d) => d.roleId === 'role-a')
      expect(roleA?.fulfillmentRate).toBe(0)
    })

    it('ポジションの holder が null の場合は在籍カウントから除外する', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [{ userId: 'u1', desiredRoleId: 'role-a' }],
        listRoleMasters: async () => [{ id: 'role-a', name: 'Senior Engineer' }],
        listPositions: async () => [
          { roleId: 'role-a', holderUserId: null },
          { roleId: 'role-a', holderUserId: 'u10' },
        ],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      const roleA = result.distribution.find((d) => d.roleId === 'role-a')
      expect(roleA?.fulfillmentRate).toBeCloseTo(1.0)
    })
  })

  describe('unfulfilledTopRoles ソート', () => {
    it('充足率が低いロールを上位 5 件返す', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [
          { userId: 'u1', desiredRoleId: 'role-a' },
          { userId: 'u2', desiredRoleId: 'role-b' },
          { userId: 'u3', desiredRoleId: 'role-c' },
          { userId: 'u4', desiredRoleId: 'role-d' },
          { userId: 'u5', desiredRoleId: 'role-e' },
          { userId: 'u6', desiredRoleId: 'role-f' },
        ],
        listRoleMasters: async () => [
          { id: 'role-a', name: 'Role A' },
          { id: 'role-b', name: 'Role B' },
          { id: 'role-c', name: 'Role C' },
          { id: 'role-d', name: 'Role D' },
          { id: 'role-e', name: 'Role E' },
          { id: 'role-f', name: 'Role F' },
        ],
        listPositions: async () => [
          { roleId: 'role-a', holderUserId: 'h1' },
        ],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      expect(result.unfulfilledTopRoles).toHaveLength(5)
      expect(result.unfulfilledTopRoles[0]?.fulfillmentRate).toBeLessThanOrEqual(
        result.unfulfilledTopRoles[1]?.fulfillmentRate ?? 1,
      )
    })

    it('充足率が低い順に並んでいる', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [
          { userId: 'u1', desiredRoleId: 'role-a' },
          { userId: 'u2', desiredRoleId: 'role-a' },
          { userId: 'u3', desiredRoleId: 'role-b' },
          { userId: 'u4', desiredRoleId: 'role-b' },
          { userId: 'u5', desiredRoleId: 'role-b' },
        ],
        listRoleMasters: async () => [
          { id: 'role-a', name: 'Role A' },
          { id: 'role-b', name: 'Role B' },
        ],
        listPositions: async () => [
          { roleId: 'role-a', holderUserId: 'h1' },
        ],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      expect(result.unfulfilledTopRoles[0]?.roleId).toBe('role-b')
      expect(result.unfulfilledTopRoles[1]?.roleId).toBe('role-a')
    })

    it('ロール数が 5 以下の場合は全件返す', async () => {
      const repo = makeRepo({
        listCurrentWishes: async () => [
          { userId: 'u1', desiredRoleId: 'role-a' },
          { userId: 'u2', desiredRoleId: 'role-b' },
        ],
        listRoleMasters: async () => [
          { id: 'role-a', name: 'Role A' },
          { id: 'role-b', name: 'Role B' },
        ],
        listPositions: async () => [],
      })
      const svc = createCareerAggregateService(repo)

      const result = await svc.getDashboard()

      expect(result.unfulfilledTopRoles).toHaveLength(2)
    })
  })
})
