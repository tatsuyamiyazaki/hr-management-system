/**
 * Issue #33 / Task 10.1: SearchService の単体テスト
 *
 * - repo をモックし、SearchService のビジネスロジックを検証
 * - ブラインドインデックス計算の統合テスト
 * - デフォルトステータス / limit / フィルターの振る舞い
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSearchService, type SearchService } from '@/lib/search/search-service'
import type { BlindIndexes, SearchRepository } from '@/lib/search/search-repository'
import type { EmployeeSearchQuery, EmployeeSearchResult } from '@/lib/search/search-types'
import { computeEmailHash, computeEmployeeCodeHash } from '@/lib/shared/crypto'

const APP_SECRET = 'test-secret-32-chars-long-enough!!'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<EmployeeSearchResult> = {}): EmployeeSearchResult {
  return {
    userId: 'usr_001',
    firstName: '太郎',
    lastName: '山田',
    firstNameKana: 'タロウ',
    lastNameKana: 'ヤマダ',
    departmentName: '開発部',
    roleId: 'role_engineer',
    status: 'ACTIVE',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock repo
// ─────────────────────────────────────────────────────────────────────────────

function makeRepo(): SearchRepository & {
  searchEmployees: ReturnType<typeof vi.fn<SearchRepository['searchEmployees']>>
} {
  return {
    searchEmployees: vi.fn<SearchRepository['searchEmployees']>(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SearchService.queryEmployees', () => {
  let repo: ReturnType<typeof makeRepo>
  let svc: SearchService

  beforeEach(() => {
    vi.clearAllMocks()
    repo = makeRepo()
    svc = createSearchService({ repo, appSecret: APP_SECRET })
  })

  it('氏名キーワードで検索した場合、repo.searchEmployees が呼ばれる', async () => {
    repo.searchEmployees.mockResolvedValue([makeResult()])

    const query: EmployeeSearchQuery = { keyword: '山田' }
    const results = await svc.queryEmployees(query)

    expect(results).toHaveLength(1)
    expect(results[0]?.lastName).toBe('山田')
    expect(repo.searchEmployees).toHaveBeenCalledOnce()
  })

  it('空キーワードの場合、blindIndexes は null/null で渡される', async () => {
    repo.searchEmployees.mockResolvedValue([])

    await svc.queryEmployees({ keyword: '' })

    const [, blindIndexes] = repo.searchEmployees.mock.calls[0] as [
      EmployeeSearchQuery,
      BlindIndexes,
    ]
    expect(blindIndexes.emailHash).toBeNull()
    expect(blindIndexes.employeeCodeHash).toBeNull()
  })

  it('メールアドレス形式のキーワードで emailHash が計算される', async () => {
    repo.searchEmployees.mockResolvedValue([])

    await svc.queryEmployees({ keyword: 'test@example.com' })

    const [, blindIndexes] = repo.searchEmployees.mock.calls[0] as [
      EmployeeSearchQuery,
      BlindIndexes,
    ]
    const expectedHash = await computeEmailHash('test@example.com', APP_SECRET)
    expect(blindIndexes.emailHash).toBe(expectedHash)
    // メール形式でも employeeCodeHash は常に計算される
    expect(blindIndexes.employeeCodeHash).not.toBeNull()
  })

  it('メール形式でないキーワードでは emailHash が null', async () => {
    repo.searchEmployees.mockResolvedValue([])

    await svc.queryEmployees({ keyword: 'E-12345' })

    const [, blindIndexes] = repo.searchEmployees.mock.calls[0] as [
      EmployeeSearchQuery,
      BlindIndexes,
    ]
    expect(blindIndexes.emailHash).toBeNull()
    const expectedCodeHash = await computeEmployeeCodeHash('E-12345', APP_SECRET)
    expect(blindIndexes.employeeCodeHash).toBe(expectedCodeHash)
  })

  it('departmentIds フィルターが query にそのまま渡される', async () => {
    repo.searchEmployees.mockResolvedValue([])

    const query: EmployeeSearchQuery = {
      keyword: '太郎',
      departmentIds: ['dept_1', 'dept_2'],
    }
    await svc.queryEmployees(query)

    const [passedQuery] = repo.searchEmployees.mock.calls[0] as [
      EmployeeSearchQuery,
      BlindIndexes,
    ]
    expect(passedQuery.departmentIds).toEqual(['dept_1', 'dept_2'])
  })

  it('roleIds フィルターが query にそのまま渡される', async () => {
    repo.searchEmployees.mockResolvedValue([])

    const query: EmployeeSearchQuery = {
      keyword: '',
      roleIds: ['role_manager'],
    }
    await svc.queryEmployees(query)

    const [passedQuery] = repo.searchEmployees.mock.calls[0] as [
      EmployeeSearchQuery,
      BlindIndexes,
    ]
    expect(passedQuery.roleIds).toEqual(['role_manager'])
  })

  it('statuses フィルターが query にそのまま渡される', async () => {
    repo.searchEmployees.mockResolvedValue([])

    const query: EmployeeSearchQuery = {
      keyword: '',
      statuses: ['ACTIVE', 'ON_LEAVE'],
    }
    await svc.queryEmployees(query)

    const [passedQuery] = repo.searchEmployees.mock.calls[0] as [
      EmployeeSearchQuery,
      BlindIndexes,
    ]
    expect(passedQuery.statuses).toEqual(['ACTIVE', 'ON_LEAVE'])
  })

  it('limit が query にそのまま渡される', async () => {
    repo.searchEmployees.mockResolvedValue([])

    const query: EmployeeSearchQuery = {
      keyword: '',
      limit: 50,
    }
    await svc.queryEmployees(query)

    const [passedQuery] = repo.searchEmployees.mock.calls[0] as [
      EmployeeSearchQuery,
      BlindIndexes,
    ]
    expect(passedQuery.limit).toBe(50)
  })

  it('検索結果が空の場合、空配列が返る', async () => {
    repo.searchEmployees.mockResolvedValue([])

    const results = await svc.queryEmployees({ keyword: '存在しない名前' })

    expect(results).toEqual([])
  })

  it('複数件の検索結果が正しく返る', async () => {
    const results = [
      makeResult({ userId: 'usr_001', lastName: '山田' }),
      makeResult({ userId: 'usr_002', lastName: '田中' }),
      makeResult({ userId: 'usr_003', lastName: '佐藤' }),
    ]
    repo.searchEmployees.mockResolvedValue(results)

    const actual = await svc.queryEmployees({ keyword: '' })

    expect(actual).toHaveLength(3)
    expect(actual.map((r) => r.userId)).toEqual(['usr_001', 'usr_002', 'usr_003'])
  })

  it('キーワードの前後空白はトリムされる（空白のみなら blindIndexes は null）', async () => {
    repo.searchEmployees.mockResolvedValue([])

    await svc.queryEmployees({ keyword: '   ' })

    const [, blindIndexes] = repo.searchEmployees.mock.calls[0] as [
      EmployeeSearchQuery,
      BlindIndexes,
    ]
    expect(blindIndexes.emailHash).toBeNull()
    expect(blindIndexes.employeeCodeHash).toBeNull()
  })
})
