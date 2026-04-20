/**
 * Issue #27: OrganizationService の単体テスト
 *
 * - repo / auditLogEmitter / exportJob を vi.fn() でモック
 * - getCurrentTree: 空ツリー / 階層ツリー構築
 * - commitHierarchyChange: 正常保存 / 循環参照でエラー
 * - changePosition: TransferRecord 記録の確認
 * - exportCsv: ExportJob へのジョブ投入と監査ログ発行
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { ExportJob } from '@/lib/export/export-job'
import type { ExportJobId } from '@/lib/export/export-types'
import { createOrganizationService } from '@/lib/organization/organization-service'
import type { OrgRepository } from '@/lib/organization/organization-repository'
import {
  toDepartmentId,
  toPositionId,
  toTransferRecordId,
  toUserId,
  type Department,
  type Position,
  type TransferRecord,
} from '@/lib/organization/organization-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const HR_USER = 'usr_hr1'
const AUDIT_CONTEXT = {
  userId: HR_USER,
  ipAddress: '10.0.0.1',
  userAgent: 'vitest',
} as const

function makeDept(overrides: Partial<Department> = {}): Department {
  return {
    id: toDepartmentId('dept_root'),
    name: 'Root',
    parentId: null,
    createdAt: new Date('2026-04-18T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }
}

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: toPositionId('pos_01'),
    departmentId: toDepartmentId('dept_root'),
    roleId: 'role_swe',
    holderUserId: null,
    supervisorPositionId: null,
    ...overrides,
  }
}

function makeTransfer(overrides: Partial<TransferRecord> = {}): TransferRecord {
  return {
    id: toTransferRecordId('tr_01'),
    userId: 'usr_001',
    fromPositionId: null,
    toPositionId: toPositionId('pos_01'),
    effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
    changedBy: HR_USER,
    createdAt: new Date('2026-04-18T12:34:56.000Z'),
    ...overrides,
  }
}

function makeRepoMock(overrides: Partial<OrgRepository> = {}): OrgRepository {
  return {
    getDepartments: vi.fn().mockResolvedValue([]),
    findDepartmentById: vi.fn().mockResolvedValue(null),
    createDepartment: vi.fn().mockResolvedValue(makeDept()),
    updateDepartment: vi.fn().mockResolvedValue(makeDept()),
    softDeleteDepartment: vi.fn().mockResolvedValue(undefined),
    getPositions: vi.fn().mockResolvedValue([]),
    findPositionById: vi.fn().mockResolvedValue(null),
    updatePositionHolder: vi.fn().mockResolvedValue(makePosition()),
    updateSupervisor: vi.fn().mockResolvedValue(makePosition()),
    createTransferRecord: vi.fn().mockResolvedValue(makeTransfer()),
    findPositionOfUser: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

function makeEmitterMock(): AuditLogEmitter {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

function makeExportJobMock(jobId = 'job_abc123'): ExportJob {
  return {
    enqueue: vi.fn().mockResolvedValue({ jobId: jobId as ExportJobId }),
    getStatus: vi.fn().mockResolvedValue(null),
    getDownloadUrl: vi.fn().mockResolvedValue(null),
  }
}

function makeService(
  repo = makeRepoMock(),
  emitter = makeEmitterMock(),
  exportJob = makeExportJobMock(),
) {
  const svc = createOrganizationService({ repo, auditLogEmitter: emitter, exportJob })
  return { svc, repo, emitter, exportJob }
}

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentTree
// ─────────────────────────────────────────────────────────────────────────────

describe('OrganizationService.getCurrentTree', () => {
  beforeEach(() => vi.clearAllMocks())

  it('部署もポジションも無い場合は空のルート配列を返す', async () => {
    const { svc } = makeService()
    const tree = await svc.getCurrentTree()
    expect(tree.roots).toEqual([])
    expect(tree.capturedAt).toBeInstanceOf(Date)
  })

  it('親子関係のある部署を階層ツリーとして構築する', async () => {
    const root = makeDept({ id: toDepartmentId('dept_root'), name: 'Root' })
    const child = makeDept({
      id: toDepartmentId('dept_eng'),
      name: 'Engineering',
      parentId: toDepartmentId('dept_root'),
    })
    const pos = makePosition({ departmentId: toDepartmentId('dept_eng') })

    const repo = makeRepoMock({
      getDepartments: vi.fn().mockResolvedValue([root, child]),
      getPositions: vi.fn().mockResolvedValue([pos]),
    })
    const { svc } = makeService(repo)

    const tree = await svc.getCurrentTree()
    expect(tree.roots).toHaveLength(1)
    const rootNode = tree.roots[0]
    expect(rootNode).toBeDefined()
    if (!rootNode) return
    expect(rootNode.department!.name).toBe('Root')
    expect(rootNode.children).toHaveLength(1)
    const childNode = rootNode.children[0]
    expect(childNode).toBeDefined()
    if (!childNode) return
    expect(childNode.department!.name).toBe('Engineering')
    expect(childNode.positions).toHaveLength(1)
  })

  it('deletedAt のある部署はツリーから除外される', async () => {
    const deleted = makeDept({
      id: toDepartmentId('dept_old'),
      name: 'Old',
      deletedAt: new Date('2026-04-18T00:00:00.000Z'),
    })
    const repo = makeRepoMock({
      getDepartments: vi.fn().mockResolvedValue([deleted]),
    })
    const { svc } = makeService(repo)
    const tree = await svc.getCurrentTree()
    expect(tree.roots).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// commitHierarchyChange
// ─────────────────────────────────────────────────────────────────────────────

describe('OrganizationService.commitHierarchyChange', () => {
  beforeEach(() => vi.clearAllMocks())

  it('正常な変更は DB 保存と監査ログを発行する', async () => {
    const root = makeDept({ id: toDepartmentId('dept_root') })
    const child = makeDept({
      id: toDepartmentId('dept_eng'),
      parentId: toDepartmentId('dept_root'),
    })
    const repo = makeRepoMock({
      getDepartments: vi.fn().mockResolvedValue([root, child]),
    })
    const { svc, emitter } = makeService(repo)

    const result = await svc.commitHierarchyChange(
      [{ type: 'RenameDepartment', departmentId: 'dept_eng', name: 'R&D' }],
      AUDIT_CONTEXT,
    )

    expect(result.ok).toBe(true)
    expect(repo.updateDepartment).toHaveBeenCalledWith('dept_eng', { name: 'R&D' })
    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: HR_USER,
        action: 'ORGANIZATION_CHANGE',
        resourceType: 'ORGANIZATION',
      }),
    )
  })

  it('循環参照が発生する変更は CyclicReferenceError を返し DB 保存しない', async () => {
    const a = makeDept({
      id: toDepartmentId('dept_a'),
      parentId: toDepartmentId('dept_b'),
    })
    const b = makeDept({
      id: toDepartmentId('dept_b'),
      parentId: null,
    })
    const repo = makeRepoMock({
      getDepartments: vi.fn().mockResolvedValue([a, b]),
    })
    const { svc, emitter } = makeService(repo)

    // dept_b を dept_a の下に移動すると循環発生
    const result = await svc.commitHierarchyChange(
      [{ type: 'MoveDepartment', departmentId: 'dept_b', newParentId: 'dept_a' }],
      AUDIT_CONTEXT,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.name).toBe('CyclicReferenceError')
      expect(result.error.kind).toBe('department')
    }
    expect(repo.updateDepartment).not.toHaveBeenCalled()
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('Position の supervisor 循環も検出する', async () => {
    const posA = makePosition({
      id: toPositionId('pos_a'),
      supervisorPositionId: toPositionId('pos_b'),
    })
    const posB = makePosition({
      id: toPositionId('pos_b'),
      supervisorPositionId: null,
    })
    const repo = makeRepoMock({
      getPositions: vi.fn().mockResolvedValue([posA, posB]),
    })
    const { svc } = makeService(repo)

    const result = await svc.commitHierarchyChange(
      [
        {
          type: 'ChangeSupervisor',
          positionId: 'pos_b',
          newSupervisorPositionId: 'pos_a',
        },
      ],
      AUDIT_CONTEXT,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('position')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// changePosition
// ─────────────────────────────────────────────────────────────────────────────

describe('OrganizationService.changePosition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('TransferRecord を作成しポジション保持者を更新する', async () => {
    const currentPos = makePosition({
      id: toPositionId('pos_a'),
      holderUserId: 'usr_001',
    })
    const transfer = makeTransfer({
      userId: 'usr_001',
      fromPositionId: toPositionId('pos_a'),
      toPositionId: toPositionId('pos_b'),
    })
    const repo = makeRepoMock({
      findPositionOfUser: vi.fn().mockResolvedValue(currentPos),
      updatePositionHolder: vi.fn().mockResolvedValue(currentPos),
      createTransferRecord: vi.fn().mockResolvedValue(transfer),
    })
    const { svc, emitter } = makeService(repo)

    const result = await svc.changePosition(
      toUserId('usr_001'),
      toPositionId('pos_b'),
      AUDIT_CONTEXT,
    )

    expect(result).toEqual(transfer)
    expect(repo.updatePositionHolder).toHaveBeenCalledWith('pos_a', null)
    expect(repo.updatePositionHolder).toHaveBeenCalledWith('pos_b', 'usr_001')
    expect(repo.createTransferRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr_001',
        fromPositionId: 'pos_a',
        toPositionId: 'pos_b',
        changedBy: HR_USER,
      }),
    )
    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ORGANIZATION_CHANGE',
        resourceType: 'POSITION',
      }),
    )
  })

  it('現ポジションが無い新規配属でも TransferRecord を記録する', async () => {
    const repo = makeRepoMock({
      findPositionOfUser: vi.fn().mockResolvedValue(null),
    })
    const { svc } = makeService(repo)

    await svc.changePosition(toUserId('usr_002'), toPositionId('pos_b'), AUDIT_CONTEXT)
    expect(repo.createTransferRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr_002',
        fromPositionId: null,
        toPositionId: 'pos_b',
      }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// exportCsv
// ─────────────────────────────────────────────────────────────────────────────

describe('OrganizationService.exportCsv', () => {
  beforeEach(() => vi.clearAllMocks())

  it('OrganizationCsv ジョブを投入し DATA_EXPORT 監査ログを発行する', async () => {
    const exportJob = makeExportJobMock('job_xyz')
    const { svc, emitter } = makeService(undefined, undefined, exportJob)

    const result = await svc.exportCsv(AUDIT_CONTEXT)

    expect(result.jobId).toBe('job_xyz')
    expect(exportJob.enqueue).toHaveBeenCalledWith({ type: 'OrganizationCsv' })
    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: HR_USER,
        action: 'DATA_EXPORT',
        resourceType: 'ORGANIZATION',
      }),
    )
  })
})
