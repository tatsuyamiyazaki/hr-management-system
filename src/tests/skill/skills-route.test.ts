/**
 * Issue #36 / Task 11.2: GET / POST /api/skills ルートハンドラのテスト
 *
 * - 認証ガード (401)
 * - 権限ガード (403: 他人のスキル一覧を MANAGER 未満が参照した場合)
 * - バリデーション (422)
 * - 正常系 (200 / 201)
 * - サービス未初期化 (503)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SkillService } from '@/lib/skill/skill-service'
import {
  setSkillServiceForTesting,
  clearSkillServiceForTesting,
} from '@/lib/skill/skill-service-di'
import { toEmployeeSkillId, type EmployeeSkill } from '@/lib/skill/skill-types'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET, POST } = await import('@/app/api/skills/route')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeGetRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/skills${query}`)
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeEmployeeSession(userId = 'user-emp-1') {
  return { user: { email: 'emp@example.com' }, role: 'EMPLOYEE', userId }
}

function makeManagerSession(userId = 'user-mgr-1') {
  return { user: { email: 'mgr@example.com' }, role: 'MANAGER', userId }
}

function makeSkill(overrides: Partial<EmployeeSkill> = {}): EmployeeSkill {
  return {
    id: toEmployeeSkillId('emp-skill-1'),
    userId: 'user-emp-1',
    skillId: 'skill-ts-1',
    level: 3,
    acquiredAt: new Date('2026-01-15T00:00:00.000Z'),
    approvedByManagerId: null,
    approvedAt: null,
    createdAt: new Date('2026-04-18T09:00:00.000Z'),
    updatedAt: new Date('2026-04-18T09:00:00.000Z'),
    ...overrides,
  }
}

function makeSkillService(overrides?: Partial<SkillService>): SkillService {
  return {
    registerSkill: vi.fn().mockResolvedValue(makeSkill()),
    approveSkill: vi.fn().mockResolvedValue(undefined),
    listMySkills: vi.fn().mockResolvedValue([]),
    listPendingApproval: vi.fn().mockResolvedValue([]),
    deleteMySkill: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SkillService
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearSkillServiceForTesting()
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/skills
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/skills', () => {
  it('未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it('EMPLOYEE が他人のスキルを要求すると 403', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession('user-emp-1'))
    setSkillServiceForTesting(makeSkillService())
    const res = await GET(makeGetRequest('?userId=user-emp-2'))
    expect(res.status).toBe(403)
  })

  it('EMPLOYEE が自分のスキル一覧を取得できる (200)', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession('user-emp-1'))
    const svc = makeSkillService({
      listMySkills: vi.fn().mockResolvedValue([makeSkill()]),
    })
    setSkillServiceForTesting(svc)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(svc.listMySkills).toHaveBeenCalledWith('user-emp-1')
  })

  it('MANAGER は他人のスキル一覧を取得できる (200)', async () => {
    mockedGetServerSession.mockResolvedValue(makeManagerSession('user-mgr-1'))
    const svc = makeSkillService({
      listMySkills: vi.fn().mockResolvedValue([makeSkill({ userId: 'user-emp-1' })]),
    })
    setSkillServiceForTesting(svc)

    const res = await GET(makeGetRequest('?userId=user-emp-1'))
    expect(res.status).toBe(200)
    expect(svc.listMySkills).toHaveBeenCalledWith('user-emp-1')
  })

  it('サービス未初期化は 503', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(503)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/skills
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/skills', () => {
  it('未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await POST(
      makePostRequest({
        skillId: 'skill-ts-1',
        level: 3,
        acquiredAt: '2026-01-15T00:00:00.000Z',
      }),
    )
    expect(res.status).toBe(401)
  })

  it('バリデーションエラー (level=0) は 422', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    setSkillServiceForTesting(makeSkillService())
    const res = await POST(
      makePostRequest({
        skillId: 'skill-ts-1',
        level: 0,
        acquiredAt: '2026-01-15T00:00:00.000Z',
      }),
    )
    expect(res.status).toBe(422)
  })

  it('バリデーションエラー (skillId 欠落) は 422', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    setSkillServiceForTesting(makeSkillService())
    const res = await POST(makePostRequest({ level: 3, acquiredAt: '2026-01-15T00:00:00.000Z' }))
    expect(res.status).toBe(422)
  })

  it('正常登録は 201 でセッション userId を強制使用', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession('user-emp-1'))
    const created = makeSkill()
    const svc = makeSkillService({ registerSkill: vi.fn().mockResolvedValue(created) })
    setSkillServiceForTesting(svc)

    const res = await POST(
      makePostRequest({
        skillId: 'skill-ts-1',
        level: 3,
        acquiredAt: '2026-01-15T00:00:00.000Z',
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(svc.registerSkill).toHaveBeenCalledWith(
      'user-emp-1',
      expect.objectContaining({ skillId: 'skill-ts-1', level: 3 }),
    )
  })

  it('サービス未初期化は 503', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    const res = await POST(
      makePostRequest({
        skillId: 'skill-ts-1',
        level: 3,
        acquiredAt: '2026-01-15T00:00:00.000Z',
      }),
    )
    expect(res.status).toBe(503)
  })
})
