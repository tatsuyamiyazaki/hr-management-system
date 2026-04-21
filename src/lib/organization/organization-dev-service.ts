import { applyOperations } from './org-tree-ops'
import type { OrganizationAuditContext, OrganizationService, Result } from './organization-service'
import {
  toDepartmentId,
  toPositionId,
  toTransferRecordId,
  type CyclicReferenceError,
  type OrgChange,
  type OrgTree,
  type OrgTreePreview,
  type PositionId,
  type TransferRecord,
  type UserId,
} from './organization-types'

function createInitialTree(): OrgTree {
  return {
    roots: [
      {
        id: toDepartmentId('dept-company'),
        name: 'Company',
        parentId: null,
        department: {
          id: toDepartmentId('dept-company'),
          name: 'Company',
          parentId: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
        },
        positions: [],
        children: [
          {
            id: toDepartmentId('dept-engineering'),
            name: 'Engineering',
            parentId: toDepartmentId('dept-company'),
            department: {
              id: toDepartmentId('dept-engineering'),
              name: 'Engineering',
              parentId: toDepartmentId('dept-company'),
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              deletedAt: null,
            },
            positions: [
              {
                id: toPositionId('pos-eng-manager'),
                departmentId: toDepartmentId('dept-engineering'),
                roleId: 'role_manager',
                holderUserId: 'dev-user-1',
                holderName: 'Development User',
                supervisorPositionId: null,
              },
            ],
            children: [
              {
                id: toDepartmentId('dept-platform'),
                name: 'Platform',
                parentId: toDepartmentId('dept-engineering'),
                department: {
                  id: toDepartmentId('dept-platform'),
                  name: 'Platform',
                  parentId: toDepartmentId('dept-engineering'),
                  createdAt: new Date('2026-01-01T00:00:00.000Z'),
                  deletedAt: null,
                },
                positions: [
                  {
                    id: toPositionId('pos-platform-lead'),
                    departmentId: toDepartmentId('dept-platform'),
                    roleId: 'role_lead',
                    holderUserId: 'team-user-1',
                    holderName: 'Aiko Tanaka',
                    supervisorPositionId: toPositionId('pos-eng-manager'),
                  },
                ],
                children: [],
              },
            ],
          },
          {
            id: toDepartmentId('dept-sales'),
            name: 'Sales',
            parentId: toDepartmentId('dept-company'),
            department: {
              id: toDepartmentId('dept-sales'),
              name: 'Sales',
              parentId: toDepartmentId('dept-company'),
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              deletedAt: null,
            },
            positions: [
              {
                id: toPositionId('pos-sales-rep'),
                departmentId: toDepartmentId('dept-sales'),
                roleId: 'role_sales',
                holderUserId: 'team-user-3',
                holderName: 'Mina Suzuki',
                supervisorPositionId: null,
              },
            ],
            children: [],
          },
        ],
      },
    ],
    capturedAt: new Date('2026-04-21T00:00:00.000Z'),
  }
}

let currentTree: OrgTree = createInitialTree()

function cloneTree(tree: OrgTree): OrgTree {
  return structuredClone(tree) as OrgTree
}

export function resetDevelopmentOrganizationTree(): void {
  currentTree = createInitialTree()
}

export function createDevelopmentOrganizationService(): OrganizationService {
  return {
    async getCurrentTree(): Promise<OrgTree> {
      return cloneTree(currentTree)
    },
    async previewHierarchyChange(changes: readonly OrgChange[]): Promise<OrgTreePreview> {
      void changes
      return { tree: cloneTree(currentTree), summary: ['Development preview is enabled'] }
    },
    async commitHierarchyChange(
      changes: readonly OrgChange[],
      context: OrganizationAuditContext,
    ): Promise<Result<void, CyclicReferenceError>> {
      void context
      const operations = changes.flatMap((change) =>
        change.type === 'MoveDepartment'
          ? [{ nodeId: change.departmentId, newParentId: change.newParentId }]
          : [],
      )
      if (operations.length > 0) {
        currentTree = applyOperations(cloneTree(currentTree), operations)
      }
      return { ok: true, value: undefined }
    },
    async changePosition(
      userId: UserId,
      newPositionId: PositionId | null,
      context: OrganizationAuditContext,
    ): Promise<TransferRecord> {
      return {
        id: toTransferRecordId('dev-transfer-1'),
        userId,
        fromPositionId: null,
        toPositionId: newPositionId,
        effectiveDate: new Date(),
        changedBy: context.userId,
        createdAt: new Date(),
      }
    },
    async exportCsv(): Promise<{ jobId: string }> {
      return { jobId: 'dev-organization-export-job' }
    },
  }
}
