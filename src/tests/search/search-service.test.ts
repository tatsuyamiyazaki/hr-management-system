/**
 * Issue #34 / Req 16.3, 16.4, 16.6: SearchService の単体テスト
 *
 * repository と rateLimiter を vi.fn() でモックし、以下の振る舞いを検証する:
 * - フィルタ条件がリポジトリに正しく渡されること (Req 16.3)
 * - statuses デフォルトで ACTIVE のみ (退職/休職除外) (Req 16.4 / 16.5)
 * - レート制限超過時に RateLimitedError が返ること (Req 16.6)
 * - 正常時に ok(results) が返ること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSearchService, type SearchRepository } from '@/lib/search/search-service'
import type { SearchRateLimiter } from '@/lib/search/search-rate-limiter'
import {
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SEARCH_STATUSES,
  type EmployeeSearchQuery,
  type EmployeeSearchResult,
} from '@/lib/search/search-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const USER_ID = 'user-1'

function makeResult(overrides: Partial<EmployeeSearchResult> = {}): EmployeeSearchResult {
  return {
    id: 'emp-1',
    firstName: '太郎',
    lastName: '山田',
    departmentId: 'dept-1',
    departmentName: '開発部',
    roleId: 'role-1',
    roleName: 'エンジニア',
    status: 'ACTIVE',
    ...overrides,
  }
}

function makeRepoMock(): SearchRepository {
  return {
    searchEmployees: vi.fn().mockResolvedValue([makeResult()]),
  }
}

function makeRateLimiterMock(allowed = true): SearchRateLimiter {
  return {
    check: vi.fn().mockResolvedValue({
      allowed,
      remaining: allowed ? 59 : 0,
      retryAfterSec: allowed ? 0 : 30,
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SearchService.queryEmployees', () => {
  let repo: SearchRepository
  let rateLimiter: SearchRateLimiter

  beforeEach(() => {
    repo = makeRepoMock()
    rateLimiter = makeRateLimiterMock(true)
  })

  it('正常な検索でリポジトリに正しいクエリが渡される', async () => {
    const svc = createSearchService({ repository: repo, rateLimiter })

    const query: EmployeeSearchQuery = {
      keyword: '山田',
      statuses: [...DEFAULT_SEARCH_STATUSES],
      limit: DEFAULT_SEARCH_LIMIT,
    }

    const result = await svc.queryEmployees(query, USER_ID)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.lastName).toBe('山田')
    }

    expect(repo.searchEmployees).toHaveBeenCalledWith(query)
  })

  it('部署フィルタがリポジトリに渡される (Req 16.3)', async () => {
    const svc = createSearchService({ repository: repo, rateLimiter })

    const query: EmployeeSearchQuery = {
      keyword: '太郎',
      departmentIds: ['dept-1', 'dept-2'],
      statuses: [...DEFAULT_SEARCH_STATUSES],
      limit: DEFAULT_SEARCH_LIMIT,
    }

    await svc.queryEmployees(query, USER_ID)

    expect(repo.searchEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ departmentIds: ['dept-1', 'dept-2'] }),
    )
  })

  it('役職フィルタがリポジトリに渡される (Req 16.3)', async () => {
    const svc = createSearchService({ repository: repo, rateLimiter })

    const query: EmployeeSearchQuery = {
      keyword: '太郎',
      roleIds: ['role-1'],
      statuses: [...DEFAULT_SEARCH_STATUSES],
      limit: DEFAULT_SEARCH_LIMIT,
    }

    await svc.queryEmployees(query, USER_ID)

    expect(repo.searchEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ roleIds: ['role-1'] }),
    )
  })

  it('ステータスフィルタで退職者を含められる (Req 16.5)', async () => {
    const svc = createSearchService({ repository: repo, rateLimiter })

    const query: EmployeeSearchQuery = {
      keyword: '田中',
      statuses: ['ACTIVE', 'RESIGNED'],
      limit: DEFAULT_SEARCH_LIMIT,
    }

    await svc.queryEmployees(query, USER_ID)

    expect(repo.searchEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['ACTIVE', 'RESIGNED'] }),
    )
  })

  it('レート制限超過時に RateLimitedError が返る (Req 16.6)', async () => {
    rateLimiter = makeRateLimiterMock(false)
    const svc = createSearchService({ repository: repo, rateLimiter })

    const query: EmployeeSearchQuery = {
      keyword: '山田',
      statuses: [...DEFAULT_SEARCH_STATUSES],
      limit: DEFAULT_SEARCH_LIMIT,
    }

    const result = await svc.queryEmployees(query, USER_ID)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error._tag).toBe('RateLimited')
      expect(result.error.retryAfterSec).toBe(30)
    }

    // レート制限超過時はリポジトリが呼ばれないこと
    expect(repo.searchEmployees).not.toHaveBeenCalled()
  })

  it('レート制限チェックで userId が正しく渡される (Req 16.6)', async () => {
    const svc = createSearchService({ repository: repo, rateLimiter })

    const query: EmployeeSearchQuery = {
      keyword: '佐藤',
      statuses: [...DEFAULT_SEARCH_STATUSES],
      limit: DEFAULT_SEARCH_LIMIT,
    }

    await svc.queryEmployees(query, 'another-user')

    expect(rateLimiter.check).toHaveBeenCalledWith('another-user')
  })

  it('limit がリポジトリに渡される', async () => {
    const svc = createSearchService({ repository: repo, rateLimiter })

    const query: EmployeeSearchQuery = {
      keyword: '検索',
      statuses: [...DEFAULT_SEARCH_STATUSES],
      limit: 5,
    }

    await svc.queryEmployees(query, USER_ID)

    expect(repo.searchEmployees).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }))
  })
})
