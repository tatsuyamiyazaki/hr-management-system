/**
 * Issue #27: 組織管理リポジトリ
 *
 * - OrgRepository: Department / Position / TransferRecord の narrow port
 * - PrismaOrgRepository: 本番 DB 実装
 *
 * Prisma 固有のエラーは DepartmentNotFoundError / PositionNotFoundError に正規化する。
 */
import { Prisma, PrismaClient } from '@prisma/client'
import {
  DepartmentNotFoundError,
  PositionNotFoundError,
  toDepartmentId,
  toPositionId,
  toTransferRecordId,
  type Department,
  type DepartmentId,
  type Position,
  type PositionId,
  type TransferRecord,
} from './organization-types'

// ─────────────────────────────────────────────────────────────────────────────
// Row shapes (mirror of generated client)
// ─────────────────────────────────────────────────────────────────────────────

type DepartmentRow = {
  id: string
  name: string
  parentId: string | null
  createdAt: Date
  deletedAt: Date | null
}

type PositionRow = {
  id: string
  departmentId: string
  roleId: string
  holderUserId: string | null
  supervisorPositionId: string | null
}

type TransferRecordRow = {
  id: string
  userId: string
  fromPositionId: string | null
  toPositionId: string | null
  effectiveDate: Date
  changedBy: string
  createdAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapDepartment(row: DepartmentRow): Department {
  return {
    id: toDepartmentId(row.id),
    name: row.name,
    parentId: row.parentId ? toDepartmentId(row.parentId) : null,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  }
}

function mapPosition(row: PositionRow): Position {
  return {
    id: toPositionId(row.id),
    departmentId: toDepartmentId(row.departmentId),
    roleId: row.roleId,
    holderUserId: row.holderUserId,
    supervisorPositionId: row.supervisorPositionId ? toPositionId(row.supervisorPositionId) : null,
  }
}

function mapTransferRecord(row: TransferRecordRow): TransferRecord {
  return {
    id: toTransferRecordId(row.id),
    userId: row.userId,
    fromPositionId: row.fromPositionId ? toPositionId(row.fromPositionId) : null,
    toPositionId: row.toPositionId ? toPositionId(row.toPositionId) : null,
    effectiveDate: row.effectiveDate,
    changedBy: row.changedBy,
    createdAt: row.createdAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateDepartmentInput {
  readonly name: string
  readonly parentId: DepartmentId | null
}

export interface UpdateDepartmentInput {
  readonly name?: string
  readonly parentId?: DepartmentId | null
}

export interface CreateTransferRecordInput {
  readonly userId: string
  readonly fromPositionId: PositionId | null
  readonly toPositionId: PositionId | null
  readonly effectiveDate: Date
  readonly changedBy: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Port
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgRepository {
  // Departments
  getDepartments(): Promise<Department[]>
  findDepartmentById(id: DepartmentId): Promise<Department | null>
  createDepartment(input: CreateDepartmentInput): Promise<Department>
  updateDepartment(id: DepartmentId, input: UpdateDepartmentInput): Promise<Department>
  softDeleteDepartment(id: DepartmentId, when: Date): Promise<void>

  // Positions
  getPositions(): Promise<Position[]>
  findPositionById(id: PositionId): Promise<Position | null>
  updatePositionHolder(id: PositionId, newHolderUserId: string | null): Promise<Position>
  updateSupervisor(id: PositionId, newSupervisorPositionId: PositionId | null): Promise<Position>

  // TransferRecord
  createTransferRecord(input: CreateTransferRecordInput): Promise<TransferRecord>
  findPositionOfUser(userId: string): Promise<Position | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma error normalization
// ─────────────────────────────────────────────────────────────────────────────

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma delegate shim (models depend on schema generation timing)
// ─────────────────────────────────────────────────────────────────────────────

interface OrgDelegates {
  department: {
    findMany(args: unknown): Promise<DepartmentRow[]>
    findUnique(args: unknown): Promise<DepartmentRow | null>
    create(args: unknown): Promise<DepartmentRow>
    update(args: unknown): Promise<DepartmentRow>
  }
  position: {
    findMany(args: unknown): Promise<PositionRow[]>
    findUnique(args: unknown): Promise<PositionRow | null>
    findFirst(args: unknown): Promise<PositionRow | null>
    update(args: unknown): Promise<PositionRow>
  }
  transferRecord: {
    create(args: unknown): Promise<TransferRecordRow>
  }
}

function asOrgDelegates(db: PrismaClient): OrgDelegates {
  return db as unknown as OrgDelegates
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma implementation
// ─────────────────────────────────────────────────────────────────────────────

class PrismaOrgRepository implements OrgRepository {
  private readonly delegates: OrgDelegates

  constructor(db: PrismaClient) {
    this.delegates = asOrgDelegates(db)
  }

  async getDepartments(): Promise<Department[]> {
    const rows = await this.delegates.department.findMany({
      where: { deletedAt: null },
      orderBy: [{ name: 'asc' }],
    })
    return rows.map(mapDepartment)
  }

  async findDepartmentById(id: DepartmentId): Promise<Department | null> {
    const row = await this.delegates.department.findUnique({ where: { id } })
    return row ? mapDepartment(row) : null
  }

  async createDepartment(input: CreateDepartmentInput): Promise<Department> {
    const row = await this.delegates.department.create({
      data: { name: input.name, parentId: input.parentId },
    })
    return mapDepartment(row)
  }

  async updateDepartment(id: DepartmentId, input: UpdateDepartmentInput): Promise<Department> {
    try {
      const data: { name?: string; parentId?: string | null } = {}
      if (input.name !== undefined) data.name = input.name
      if (input.parentId !== undefined) data.parentId = input.parentId
      const row = await this.delegates.department.update({ where: { id }, data })
      return mapDepartment(row)
    } catch (err) {
      if (isRecordNotFound(err)) throw new DepartmentNotFoundError(id)
      throw err
    }
  }

  async softDeleteDepartment(id: DepartmentId, when: Date): Promise<void> {
    try {
      await this.delegates.department.update({
        where: { id },
        data: { deletedAt: when },
      })
    } catch (err) {
      if (isRecordNotFound(err)) throw new DepartmentNotFoundError(id)
      throw err
    }
  }

  async getPositions(): Promise<Position[]> {
    const rows = await this.delegates.position.findMany({ orderBy: [{ id: 'asc' }] })
    return rows.map(mapPosition)
  }

  async findPositionById(id: PositionId): Promise<Position | null> {
    const row = await this.delegates.position.findUnique({ where: { id } })
    return row ? mapPosition(row) : null
  }

  async updatePositionHolder(id: PositionId, newHolderUserId: string | null): Promise<Position> {
    try {
      const row = await this.delegates.position.update({
        where: { id },
        data: { holderUserId: newHolderUserId },
      })
      return mapPosition(row)
    } catch (err) {
      if (isRecordNotFound(err)) throw new PositionNotFoundError(id)
      throw err
    }
  }

  async updateSupervisor(
    id: PositionId,
    newSupervisorPositionId: PositionId | null,
  ): Promise<Position> {
    try {
      const row = await this.delegates.position.update({
        where: { id },
        data: { supervisorPositionId: newSupervisorPositionId },
      })
      return mapPosition(row)
    } catch (err) {
      if (isRecordNotFound(err)) throw new PositionNotFoundError(id)
      throw err
    }
  }

  async findPositionOfUser(userId: string): Promise<Position | null> {
    const row = await this.delegates.position.findFirst({
      where: { holderUserId: userId },
    })
    return row ? mapPosition(row) : null
  }

  async createTransferRecord(input: CreateTransferRecordInput): Promise<TransferRecord> {
    const row = await this.delegates.transferRecord.create({
      data: {
        userId: input.userId,
        fromPositionId: input.fromPositionId,
        toPositionId: input.toPositionId,
        effectiveDate: input.effectiveDate,
        changedBy: input.changedBy,
      },
    })
    return mapTransferRecord(row)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPrismaOrgRepository(db?: PrismaClient): OrgRepository {
  return new PrismaOrgRepository(db ?? new PrismaClient())
}
