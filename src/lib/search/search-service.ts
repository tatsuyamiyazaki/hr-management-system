/**
 * Issue #34 / Req 16.3, 16.4, 16.6: 社員検索サービス
 *
 * - queryEmployees: フィルタリング + レート制限付き社員検索
 * - 部署・役職・ステータスフィルタ (Req 16.3)
 * - 退職/休職社員のデフォルト除外 (Req 16.5 → statuses デフォルト ACTIVE)
 * - 検索専用レート制限 60 req/min/user (Req 16.6)
 */
import type { Result } from '@/lib/shared/domain-error'
import { ok, err } from '@/lib/shared/domain-error'
import type { RateLimitedError } from '@/lib/shared/domain-error'
import type { SearchRateLimiter } from './search-rate-limiter'
import type { EmployeeSearchQuery, EmployeeSearchResult } from './search-types'

// ─────────────────────────────────────────────────────────────────────────────
// Repository port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 社員検索のリポジトリポート。
 * PostgreSQL FTS (pg_trgm + tsvector) による実装を想定 (Task 10.1)。
 * 本タスクではインターフェースのみ定義し、フィルタ条件の受け渡し契約を確立する。
 */
export interface SearchRepository {
  /**
   * 検索クエリに基づいて社員を取得する。
   * リポジトリ実装はキーワード検索 + フィルタを SQL に変換する。
   */
  searchEmployees(query: EmployeeSearchQuery): Promise<EmployeeSearchResult[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchService {
  /**
   * 社員を検索する。
   *
   * - statuses 未指定時は ACTIVE のみ（退職/休職をデフォルト除外）
   * - レート制限超過時は RateLimitedError を返す
   */
  queryEmployees(
    query: EmployeeSearchQuery,
    userId: string,
  ): Promise<Result<EmployeeSearchResult[], RateLimitedError>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchServiceDeps {
  readonly repository: SearchRepository
  readonly rateLimiter: SearchRateLimiter
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class SearchServiceImpl implements SearchService {
  private readonly repository: SearchRepository
  private readonly rateLimiter: SearchRateLimiter

  constructor(deps: SearchServiceDeps) {
    this.repository = deps.repository
    this.rateLimiter = deps.rateLimiter
  }

  async queryEmployees(
    query: EmployeeSearchQuery,
    userId: string,
  ): Promise<Result<EmployeeSearchResult[], RateLimitedError>> {
    // レート制限チェック (Req 16.6)
    const rateResult = await this.rateLimiter.check(userId)
    if (!rateResult.allowed) {
      return err({
        _tag: 'RateLimited',
        retryAfterSec: rateResult.retryAfterSec,
      })
    }

    // リポジトリに検索を委譲
    // statuses は Zod スキーマのデフォルトで ['ACTIVE'] が設定済み
    const results = await this.repository.searchEmployees(query)

    return ok(results)
  }
}

export function createSearchService(deps: SearchServiceDeps): SearchService {
  return new SearchServiceImpl(deps)
}
