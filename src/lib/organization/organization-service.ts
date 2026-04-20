/**
 * Issue #27 / Req 3.3, 3.4, 3.6, 3.7, 3.8: 組織管理サービス
 *
 * - getCurrentTree: Department を階層ツリーとして取得 (Req 3.6)
 * - previewHierarchyChange / commitHierarchyChange:
 *   変更プレビューと確定。循環参照検出 (Req 3.4) とコミット時の監査ログ記録 (Req 3.3)
 * - changePosition: ポジション変更時に TransferRecord を記録 (Req 3.7)
 * - exportCsv: ExportJob に OrganizationCsv ジョブを投入 (Req 3.8)
 */
import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { AuditLogEntry } from '@/lib/audit/audit-log-types'
import type { ExportJob } from '@/lib/export/export-job'
import type { ExportJobId } from '@/lib/export/export-types'
import { detectCycle, type ParentMap } from './cycle-detection'
import type { OrgRepository } from './organization-repository'
import {
  CyclicReferenceError,
  DepartmentNotFoundError,
  PositionNotFoundError,
  toDepartmentId,
  toPositionId,
  type Department,
  type OrgChange,
  type OrgNode,
  type OrgTree,
  type OrgTreePreview,
  type Position,
  type PositionId,
  type TransferRecord,
  type UserId,
} from './organization-types'

// ─────────────────────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────────────────────

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context (audit)
// ─────────────────────────────────────────────────────────────────────────────

export interface OrganizationAuditContext {
  readonly userId: string
  readonly ipAddress: string
  readonly userAgent: string
}

const UNKNOWN_IP = 'unknown'
const UNKNOWN_UA = 'unknown'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface OrganizationService {
  getCurrentTree(): Promise<OrgTree>
  previewHierarchyChange(changes: readonly OrgChange[]): Promise<OrgTreePreview>
  commitHierarchyChange(
    changes: readonly OrgChange[],
    context: OrganizationAuditContext,
  ): Promise<Result<void, CyclicReferenceError>>
  changePosition(
    userId: UserId,
    newPositionId: PositionId | null,
    context: OrganizationAuditContext,
  ): Promise<TransferRecord>
  exportCsv(context: OrganizationAuditContext): Promise<{ jobId: ExportJobId }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface OrganizationServiceDeps {
  readonly repo: OrgRepository
  readonly auditLogEmitter: AuditLogEmitter
  readonly exportJob: ExportJob
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree building (pure)
// ─────────────────────────────────────────────────────────────────────────────

function buildTree(
  departments: readonly Department[],
  positions: readonly Position[],
  capturedAt: Date,
): OrgTree {
  const byParent = new Map<string | null, Department[]>()
  for (const dept of departments) {
    if (dept.deletedAt) continue
    const key = dept.parentId ?? null
    const bucket = byParent.get(key) ?? []
    bucket.push(dept)
    byParent.set(key, bucket)
  }

  const positionsByDept = new Map<string, Position[]>()
  for (const pos of positions) {
    if (!pos.departmentId) continue
    const list = positionsByDept.get(pos.departmentId) ?? []
    list.push(pos)
    positionsByDept.set(pos.departmentId, list)
  }

  const buildNode = (dept: Department): OrgNode => ({
    id: dept.id,
    name: dept.name,
    parentId: dept.parentId,
    department: dept,
    positions: positionsByDept.get(dept.id) ?? [],
    children: (byParent.get(dept.id) ?? []).map(buildNode),
  })

  const roots = (byParent.get(null) ?? []).map(buildNode)
  return { roots, capturedAt }
}

// ─────────────────────────────────────────────────────────────────────────────
// Change application (pure, over in-memory maps)
// ─────────────────────────────────────────────────────────────────────────────

interface AppliedChanges {
  readonly departments: Map<string, Department>
  readonly positions: Map<string, Position>
  readonly summary: string[]
}

function cloneDepartmentsMap(departments: readonly Department[]): Map<string, Department> {
  const map = new Map<string, Department>()
  for (const dept of departments) map.set(dept.id, dept)
  return map
}

function clonePositionsMap(positions: readonly Position[]): Map<string, Position> {
  const map = new Map<string, Position>()
  for (const pos of positions) map.set(pos.id, pos)
  return map
}

function applyChanges(
  departments: readonly Department[],
  positions: readonly Position[],
  changes: readonly OrgChange[],
  now: Date,
): AppliedChanges {
  const deptMap = cloneDepartmentsMap(departments)
  const posMap = clonePositionsMap(positions)
  const summary: string[] = []
  for (const change of changes) {
    applySingleChange(change, deptMap, posMap, summary, now)
  }
  return { departments: deptMap, positions: posMap, summary }
}

function applySingleChange(
  change: OrgChange,
  deptMap: Map<string, Department>,
  posMap: Map<string, Position>,
  summary: string[],
  now: Date,
): void {
  switch (change.type) {
    case 'CreateDepartment':
      deptMap.set(change.tempId, {
        id: toDepartmentId(change.tempId),
        name: change.name,
        parentId: change.parentId ? toDepartmentId(change.parentId) : null,
        createdAt: now,
        deletedAt: null,
      })
      summary.push(`Create department "${change.name}"`)
      return
    case 'RenameDepartment': {
      const existing = deptMap.get(change.departmentId)
      if (!existing) throw new DepartmentNotFoundError(change.departmentId)
      deptMap.set(change.departmentId, { ...existing, name: change.name })
      summary.push(`Rename department ${change.departmentId} -> "${change.name}"`)
      return
    }
    case 'MoveDepartment': {
      const existing = deptMap.get(change.departmentId)
      if (!existing) throw new DepartmentNotFoundError(change.departmentId)
      deptMap.set(change.departmentId, {
        ...existing,
        parentId: change.newParentId ? toDepartmentId(change.newParentId) : null,
      })
      summary.push(`Move department ${change.departmentId} under ${change.newParentId ?? 'ROOT'}`)
      return
    }
    case 'DeleteDepartment': {
      const existing = deptMap.get(change.departmentId)
      if (!existing) throw new DepartmentNotFoundError(change.departmentId)
      deptMap.set(change.departmentId, { ...existing, deletedAt: now })
      summary.push(`Delete department ${change.departmentId}`)
      return
    }
    case 'ChangeSupervisor': {
      const existing = posMap.get(change.positionId)
      if (!existing) throw new PositionNotFoundError(change.positionId)
      posMap.set(change.positionId, {
        ...existing,
        supervisorPositionId: change.newSupervisorPositionId
          ? toPositionId(change.newSupervisorPositionId)
          : null,
      })
      summary.push(
        `Change supervisor of ${change.positionId} to ${change.newSupervisorPositionId ?? 'NONE'}`,
      )
      return
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cycle checks (wrap pure function)
// ─────────────────────────────────────────────────────────────────────────────

function buildDepartmentParentMap(departments: ReadonlyMap<string, Department>): ParentMap {
  const map = new Map<string, string | null>()
  for (const [id, dept] of departments) {
    if (dept.deletedAt) continue
    map.set(id, dept.parentId)
  }
  return map
}

function buildSupervisorParentMap(positions: ReadonlyMap<string, Position>): ParentMap {
  const map = new Map<string, string | null>()
  for (const [id, pos] of positions) {
    map.set(id, pos.supervisorPositionId ?? null)
  }
  return map
}

function assertNoCycle(applied: AppliedChanges): CyclicReferenceError | null {
  const deptCheck = detectCycle(buildDepartmentParentMap(applied.departments))
  if (!deptCheck.ok) return new CyclicReferenceError('department', deptCheck.path)
  const posCheck = detectCycle(buildSupervisorParentMap(applied.positions))
  if (!posCheck.ok) return new CyclicReferenceError('position', posCheck.path)
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class OrganizationServiceImpl implements OrganizationService {
  private readonly repo: OrgRepository
  private readonly auditLogEmitter: AuditLogEmitter
  private readonly exportJob: ExportJob

  constructor(deps: OrganizationServiceDeps) {
    this.repo = deps.repo
    this.auditLogEmitter = deps.auditLogEmitter
    this.exportJob = deps.exportJob
  }

  async getCurrentTree(): Promise<OrgTree> {
    const [departments, positions] = await Promise.all([
      this.repo.getDepartments(),
      this.repo.getPositions(),
    ])
    return buildTree(departments, positions, new Date())
  }

  async previewHierarchyChange(changes: readonly OrgChange[]): Promise<OrgTreePreview> {
    const [departments, positions] = await Promise.all([
      this.repo.getDepartments(),
      this.repo.getPositions(),
    ])
    const now = new Date()
    const applied = applyChanges(departments, positions, changes, now)

    const cyclic = assertNoCycle(applied)
    const summary = cyclic ? [...applied.summary, `WARNING: ${cyclic.message}`] : applied.summary

    const tree = buildTree([...applied.departments.values()], [...applied.positions.values()], now)
    return { tree, summary }
  }

  async commitHierarchyChange(
    changes: readonly OrgChange[],
    context: OrganizationAuditContext,
  ): Promise<Result<void, CyclicReferenceError>> {
    const [departments, positions] = await Promise.all([
      this.repo.getDepartments(),
      this.repo.getPositions(),
    ])
    const now = new Date()
    const applied = applyChanges(departments, positions, changes, now)

    const cyclic = assertNoCycle(applied)
    if (cyclic) return err(cyclic)

    await this.persistChanges(changes, now)
    await this.emitOrganizationAudit(changes, context)
    return ok(undefined)
  }

  async changePosition(
    userId: UserId,
    newPositionId: PositionId | null,
    context: OrganizationAuditContext,
  ): Promise<TransferRecord> {
    const currentPosition = await this.repo.findPositionOfUser(userId)
    const fromPositionId = currentPosition?.id ?? null

    if (currentPosition && currentPosition.holderUserId === userId) {
      await this.repo.updatePositionHolder(currentPosition.id, null)
    }
    if (newPositionId) {
      await this.repo.updatePositionHolder(newPositionId, userId)
    }

    const transfer = await this.repo.createTransferRecord({
      userId,
      fromPositionId,
      toPositionId: newPositionId,
      effectiveDate: new Date(),
      changedBy: context.userId,
    })

    await this.auditLogEmitter.emit({
      userId: context.userId,
      action: 'ORGANIZATION_CHANGE',
      resourceType: 'POSITION',
      resourceId: newPositionId ?? fromPositionId ?? null,
      ipAddress: context.ipAddress || UNKNOWN_IP,
      userAgent: context.userAgent || UNKNOWN_UA,
      before: fromPositionId ? { positionId: fromPositionId, userId } : null,
      after: newPositionId ? { positionId: newPositionId, userId } : null,
    })

    return transfer
  }

  async exportCsv(context: OrganizationAuditContext): Promise<{ jobId: ExportJobId }> {
    const result = await this.exportJob.enqueue({ type: 'OrganizationCsv' })
    await this.auditLogEmitter.emit({
      userId: context.userId,
      action: 'DATA_EXPORT',
      resourceType: 'ORGANIZATION',
      resourceId: null,
      ipAddress: context.ipAddress || UNKNOWN_IP,
      userAgent: context.userAgent || UNKNOWN_UA,
      before: null,
      after: { jobId: result.jobId, type: 'OrganizationCsv' },
    })
    return result
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async persistChanges(changes: readonly OrgChange[], when: Date): Promise<void> {
    for (const change of changes) {
      await this.persistSingleChange(change, when)
    }
  }

  private async persistSingleChange(change: OrgChange, when: Date): Promise<void> {
    switch (change.type) {
      case 'CreateDepartment':
        await this.repo.createDepartment({
          name: change.name,
          parentId: change.parentId ? toDepartmentId(change.parentId) : null,
        })
        return
      case 'RenameDepartment':
        await this.repo.updateDepartment(toDepartmentId(change.departmentId), {
          name: change.name,
        })
        return
      case 'MoveDepartment':
        await this.repo.updateDepartment(toDepartmentId(change.departmentId), {
          parentId: change.newParentId ? toDepartmentId(change.newParentId) : null,
        })
        return
      case 'DeleteDepartment':
        await this.repo.softDeleteDepartment(toDepartmentId(change.departmentId), when)
        return
      case 'ChangeSupervisor':
        await this.repo.updateSupervisor(
          toPositionId(change.positionId),
          change.newSupervisorPositionId ? toPositionId(change.newSupervisorPositionId) : null,
        )
        return
    }
  }

  private async emitOrganizationAudit(
    changes: readonly OrgChange[],
    context: OrganizationAuditContext,
  ): Promise<void> {
    const entry: AuditLogEntry = {
      userId: context.userId,
      action: 'ORGANIZATION_CHANGE',
      resourceType: 'ORGANIZATION',
      resourceId: null,
      ipAddress: context.ipAddress || UNKNOWN_IP,
      userAgent: context.userAgent || UNKNOWN_UA,
      before: null,
      after: { changes: changes.map((c) => ({ ...c })) },
    }
    await this.auditLogEmitter.emit(entry)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createOrganizationService(deps: OrganizationServiceDeps): OrganizationService {
  return new OrganizationServiceImpl(deps)
}
