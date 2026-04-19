import type { CareerWishRepository } from './career-wish-repository'
import type { CareerWish, CareerWishInput } from './career-wish-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface CareerWishService {
  /** 現在有効な希望を登録（既存の有効な希望は supersededAt をセット） */
  registerWish(userId: string, input: CareerWishInput): Promise<CareerWish>
  /** 現在有効な希望を取得 */
  getCurrentWish(userId: string): Promise<CareerWish | null>
  /** 全履歴を取得 */
  getWishHistory(userId: string): Promise<CareerWish[]>
  /** 全社員の現在の希望一覧 */
  listAllCurrentWishes(): Promise<CareerWish[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class CareerWishServiceImpl implements CareerWishService {
  private readonly repo: CareerWishRepository
  private readonly clock: () => Date

  constructor(repo: CareerWishRepository, clock: () => Date) {
    this.repo = repo
    this.clock = clock
  }

  async registerWish(userId: string, input: CareerWishInput): Promise<CareerWish> {
    const current = await this.repo.findCurrentWish(userId)
    if (current) {
      await this.repo.supersede(current.id, this.clock())
    }
    return this.repo.createWish(userId, input)
  }

  async getCurrentWish(userId: string): Promise<CareerWish | null> {
    return this.repo.findCurrentWish(userId)
  }

  async getWishHistory(userId: string): Promise<CareerWish[]> {
    return this.repo.listAllByUser(userId)
  }

  async listAllCurrentWishes(): Promise<CareerWish[]> {
    return this.repo.listAllCurrent()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createCareerWishService(
  repo: CareerWishRepository,
  clock: () => Date = () => new Date(),
): CareerWishService {
  return new CareerWishServiceImpl(repo, clock)
}
