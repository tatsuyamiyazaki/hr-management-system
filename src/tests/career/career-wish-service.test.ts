/**
 * Issue #39 / Task 12.1: CareerWishService の単体テスト (Req 5.2, 5.6, 5.7)
 *
 * - registerWish: 新規登録 / 既存希望の supersededAt セット
 * - getCurrentWish: 現在有効な希望取得
 * - getWishHistory: 全履歴取得
 * - listAllCurrentWishes: 全社員の現在の希望一覧
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCareerWishService } from '@/lib/career/career-wish-service'
import type { CareerWishRepository } from '@/lib/career/career-wish-repository'
import {
  toCareerWishId,
  type CareerWish,
  type CareerWishInput,
} from '@/lib/career/career-wish-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const EMPLOYEE_ID = 'user-emp-1'
const ROLE_ID = 'role-senior-1'

function makeCareerWish(overrides: Partial<CareerWish> = {}): CareerWish {
  return {
    id: toCareerWishId('wish-1'),
    userId: EMPLOYEE_ID,
    desiredRoleId: ROLE_ID,
    desiredRoleName: 'Senior Engineer',
    desiredAt: new Date('2027-04-01T00:00:00.000Z'),
    comment: null,
    supersededAt: null,
    createdAt: new Date('2026-04-19T09:00:00.000Z'),
    ...overrides,
  }
}

function makeInput(overrides: Partial<CareerWishInput> = {}): CareerWishInput {
  return {
    desiredRoleId: ROLE_ID,
    desiredAt: new Date('2027-04-01T00:00:00.000Z'),
    comment: undefined,
    ...overrides,
  }
}

function makeRepoMock(): CareerWishRepository {
  return {
    findCurrentWish: vi.fn().mockResolvedValue(null),
    createWish: vi.fn().mockResolvedValue(makeCareerWish()),
    supersede: vi.fn().mockResolvedValue(undefined),
    listAllByUser: vi.fn().mockResolvedValue([]),
    listAllCurrent: vi.fn().mockResolvedValue([]),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CareerWishService', () => {
  let repo: CareerWishRepository
  const FIXED_DATE = new Date('2026-04-19T12:00:00.000Z')

  beforeEach(() => {
    repo = makeRepoMock()
  })

  describe('registerWish', () => {
    it('既存の有効な希望がない場合に新規希望を作成する', async () => {
      const svc = createCareerWishService(repo, () => FIXED_DATE)
      const input = makeInput()

      await svc.registerWish(EMPLOYEE_ID, input)

      expect(repo.findCurrentWish).toHaveBeenCalledWith(EMPLOYEE_ID)
      expect(repo.supersede).not.toHaveBeenCalled()
      expect(repo.createWish).toHaveBeenCalledWith(EMPLOYEE_ID, input)
    })

    it('既存の有効な希望がある場合に supersededAt をセットして新規作成する', async () => {
      const existing = makeCareerWish({ supersededAt: null })
      vi.mocked(repo.findCurrentWish).mockResolvedValue(existing)
      const svc = createCareerWishService(repo, () => FIXED_DATE)
      const input = makeInput({ comment: 'updated goal' })

      await svc.registerWish(EMPLOYEE_ID, input)

      expect(repo.supersede).toHaveBeenCalledWith(existing.id, FIXED_DATE)
      expect(repo.createWish).toHaveBeenCalledWith(EMPLOYEE_ID, input)
    })

    it('新しく作成した希望を返す', async () => {
      const expected = makeCareerWish({ comment: 'new' })
      vi.mocked(repo.createWish).mockResolvedValue(expected)
      const svc = createCareerWishService(repo, () => FIXED_DATE)

      const result = await svc.registerWish(EMPLOYEE_ID, makeInput())

      expect(result).toEqual(expected)
    })
  })

  describe('getCurrentWish', () => {
    it('supersededAt が null の希望を返す', async () => {
      const wish = makeCareerWish({ supersededAt: null })
      vi.mocked(repo.findCurrentWish).mockResolvedValue(wish)
      const svc = createCareerWishService(repo)

      const result = await svc.getCurrentWish(EMPLOYEE_ID)

      expect(result).toEqual(wish)
    })

    it('有効な希望がない場合 null を返す', async () => {
      vi.mocked(repo.findCurrentWish).mockResolvedValue(null)
      const svc = createCareerWishService(repo)

      const result = await svc.getCurrentWish(EMPLOYEE_ID)

      expect(result).toBeNull()
    })
  })

  describe('getWishHistory', () => {
    it('ユーザーの全履歴（現在＋過去）を返す', async () => {
      const history = [
        makeCareerWish({ id: toCareerWishId('wish-2'), supersededAt: new Date('2026-04-19T00:00:00.000Z') }),
        makeCareerWish({ id: toCareerWishId('wish-1'), supersededAt: null }),
      ]
      vi.mocked(repo.listAllByUser).mockResolvedValue(history)
      const svc = createCareerWishService(repo)

      const result = await svc.getWishHistory(EMPLOYEE_ID)

      expect(result).toEqual(history)
      expect(repo.listAllByUser).toHaveBeenCalledWith(EMPLOYEE_ID)
    })
  })

  describe('listAllCurrentWishes', () => {
    it('全社員の現在有効な希望一覧を返す', async () => {
      const wishes = [makeCareerWish(), makeCareerWish({ userId: 'user-emp-2' })]
      vi.mocked(repo.listAllCurrent).mockResolvedValue(wishes)
      const svc = createCareerWishService(repo)

      const result = await svc.listAllCurrentWishes()

      expect(result).toEqual(wishes)
    })
  })
})
