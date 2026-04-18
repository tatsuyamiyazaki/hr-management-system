/**
 * Issue #24: GET / POST /api/masters/skills ルートハンドラのテスト
 *
 * - 認証ガード (401 / 403)
 * - バリデーション (422)
 * - 正常系 (200 / 201)
 * - ドメインエラーマッピング (409: MasterNameConflictError)
 * - サービス未初期化 (503)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { MasterNameConflictError } from '@/lib/master/master-types'
import type { MasterService } from '@/lib/master/master-service'
import {
  setMasterServiceForTesting,
  clearMasterServiceForTesting,
} from '@/lib/master/master-service-di'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET, POST } = await import('@/app/api/masters/skills/route')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeGetRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/masters/skills${query}`)
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/masters/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeAdminSession(userId = 'admin-1') {
  return { user: { email: 'admin@example.com' }, role: 'ADMIN', userId }
}

function makeMasterService(overrides?: Partial<MasterService>): MasterService {
  return {
    listSkills: vi.fn().mockResolvedValue([]),
    upsertSkill: vi.fn().mockResolvedValue(undefined),
    deprecateSkill: vi.fn().mockResolvedValue(undefined),
    listRoles: vi.fn().mockResolvedValue([]),
    upsertRole: vi.fn().mockResolvedValue(undefined),
    deleteRole: vi.fn().mockResolvedValue(undefined),
    listGrades: vi.fn().mockResolvedValue([]),
    upsertGrade: vi.fn().mockResolvedValue(undefined),
    deleteGrade: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MasterService
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearMasterServiceForTesting()
})

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/masters/skills', () => {
  it('未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it('ADMIN 以外のロールは 403', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { email: 'hr@example.com' },
      role: 'HR_MANAGER',
      userId: 'hr-1',
    })
    setMasterServiceForTesting(makeMasterService())
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it('正常系は 200 で一覧を返す', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    const skills = [
      {
        id: 'skill-1',
        name: 'TypeScript',
        category: 'language',
        description: null,
        deprecated: false,
        createdAt: new Date('2026-04-18T00:00:00.000Z'),
      },
    ]
    const svc = makeMasterService({ listSkills: vi.fn().mockResolvedValue(skills) })
    setMasterServiceForTesting(svc)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(svc.listSkills).toHaveBeenCalledWith(false)
  })

  it('includeDeprecated=true クエリを MasterService に伝播する', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    const svc = makeMasterService({ listSkills: vi.fn().mockResolvedValue([]) })
    setMasterServiceForTesting(svc)

    await GET(makeGetRequest('?includeDeprecated=true'))
    expect(svc.listSkills).toHaveBeenCalledWith(true)
  })

  it('サービス未初期化は 503', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(503)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/masters/skills', () => {
  it('未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await POST(makePostRequest({ name: 'Rust', category: 'language' }))
    expect(res.status).toBe(401)
  })

  it('バリデーションエラー(name 欠落)は 422', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    setMasterServiceForTesting(makeMasterService())
    const res = await POST(makePostRequest({ category: 'language' }))
    expect(res.status).toBe(422)
  })

  it('正常系は 201 で作成結果を返す', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    const created = {
      id: 'skill-1',
      name: 'Rust',
      category: 'language',
      description: null,
      deprecated: false,
      createdAt: new Date('2026-04-18T00:00:00.000Z'),
    }
    const svc = makeMasterService({ upsertSkill: vi.fn().mockResolvedValue(created) })
    setMasterServiceForTesting(svc)

    const res = await POST(makePostRequest({ name: 'Rust', category: 'language' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.name).toBe('Rust')
  })

  it('name 一意制約違反は 409', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    setMasterServiceForTesting(
      makeMasterService({
        upsertSkill: vi.fn().mockRejectedValue(new MasterNameConflictError('skill', 'Rust')),
      }),
    )
    const res = await POST(makePostRequest({ name: 'Rust', category: 'language' }))
    expect(res.status).toBe(409)
  })

  it('サービス未初期化は 503', async () => {
    mockedGetServerSession.mockResolvedValue(makeAdminSession())
    const res = await POST(makePostRequest({ name: 'Rust', category: 'language' }))
    expect(res.status).toBe(503)
  })
})
