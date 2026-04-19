import { PrismaClient } from '@prisma/client'
import { toCareerWishId, type CareerWish, type CareerWishId, type CareerWishInput } from './career-wish-types'

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row shape
// ─────────────────────────────────────────────────────────────────────────────

type CareerWishRow = {
  id: string
  userId: string
  desiredRoleId: string
  desiredAt: Date
  comment: string | null
  supersededAt: Date | null
  createdAt: Date
  desiredRole: { name: string }
}

function mapRow(row: CareerWishRow): CareerWish {
  return {
    id: toCareerWishId(row.id),
    userId: row.userId,
    desiredRoleId: row.desiredRoleId,
    desiredRoleName: row.desiredRole.name,
    desiredAt: row.desiredAt,
    comment: row.comment,
    supersededAt: row.supersededAt,
    createdAt: row.createdAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Port
// ─────────────────────────────────────────────────────────────────────────────

export interface CareerWishRepository {
  /** supersededAt が null の現在有効な希望を取得 */
  findCurrentWish(userId: string): Promise<CareerWish | null>
  /** 新しい希望を作成 */
  createWish(userId: string, input: CareerWishInput): Promise<CareerWish>
  /** 指定 wish の supersededAt をセット（履歴化） */
  supersede(id: CareerWishId, supersededAt: Date): Promise<void>
  /** ユーザーの全履歴（現在＋過去）を createdAt 降順で返す */
  listAllByUser(userId: string): Promise<CareerWish[]>
  /** 全社員の現在有効な希望一覧 */
  listAllCurrent(): Promise<CareerWish[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma delegate shim
// ─────────────────────────────────────────────────────────────────────────────

interface CareerWishDelegates {
  careerWish: {
    findFirst(args: unknown): Promise<CareerWishRow | null>
    create(args: unknown): Promise<CareerWishRow>
    update(args: unknown): Promise<CareerWishRow>
    findMany(args: unknown): Promise<CareerWishRow[]>
  }
}

function asDelegates(db: PrismaClient): CareerWishDelegates {
  return db as unknown as CareerWishDelegates
}

const ROLE_INCLUDE = { desiredRole: { select: { name: true } } }

// ─────────────────────────────────────────────────────────────────────────────
// Prisma implementation
// ─────────────────────────────────────────────────────────────────────────────

class PrismaCareerWishRepository implements CareerWishRepository {
  private readonly delegates: CareerWishDelegates

  constructor(db: PrismaClient) {
    this.delegates = asDelegates(db)
  }

  async findCurrentWish(userId: string): Promise<CareerWish | null> {
    const row = await this.delegates.careerWish.findFirst({
      where: { userId, supersededAt: null },
      include: ROLE_INCLUDE,
    })
    return row ? mapRow(row) : null
  }

  async createWish(userId: string, input: CareerWishInput): Promise<CareerWish> {
    const row = await this.delegates.careerWish.create({
      data: {
        userId,
        desiredRoleId: input.desiredRoleId,
        desiredAt: input.desiredAt,
        comment: input.comment ?? null,
      },
      include: ROLE_INCLUDE,
    })
    return mapRow(row)
  }

  async supersede(id: CareerWishId, supersededAt: Date): Promise<void> {
    await this.delegates.careerWish.update({
      where: { id },
      data: { supersededAt },
    })
  }

  async listAllByUser(userId: string): Promise<CareerWish[]> {
    const rows = await this.delegates.careerWish.findMany({
      where: { userId },
      include: ROLE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(mapRow)
  }

  async listAllCurrent(): Promise<CareerWish[]> {
    const rows = await this.delegates.careerWish.findMany({
      where: { supersededAt: null },
      include: ROLE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(mapRow)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPrismaCareerWishRepository(db?: PrismaClient): CareerWishRepository {
  return new PrismaCareerWishRepository(db ?? new PrismaClient())
}
