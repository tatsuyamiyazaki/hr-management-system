/**
 * Issue #33 / Req 16.1, 16.2, 16.5: 社員検索サービス
 *
 * - SearchService: 社員検索の公開インターフェース
 * - SearchServiceImpl: リポジトリ + ブラインドインデックス計算の統合
 *
 * keyword に対して:
 *   1. 氏名・部署名 → pg_trgm 部分一致（Repository 内 ILIKE）
 *   2. メール・社員番号 → HMAC-SHA256 ブラインドインデックスで完全一致
 */
import { computeEmailHash, computeEmployeeCodeHash } from '@/lib/shared/crypto'
import type { BlindIndexes, SearchRepository } from './search-repository'
import type { EmployeeSearchQuery, EmployeeSearchResult } from './search-types'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchService {
  /**
   * 社員を検索する。
   *
   * keyword が氏名にマッチしない場合、メールアドレスや社員番号の
   * ブラインドインデックス（HMAC-SHA256 完全一致）もフォールバックで検索する。
   */
  queryEmployees(query: EmployeeSearchQuery): Promise<EmployeeSearchResult[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchServiceDeps {
  readonly repo: SearchRepository
  readonly appSecret: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class SearchServiceImpl implements SearchService {
  private readonly repo: SearchRepository
  private readonly appSecret: string

  constructor(deps: SearchServiceDeps) {
    this.repo = deps.repo
    this.appSecret = deps.appSecret
  }

  async queryEmployees(query: EmployeeSearchQuery): Promise<EmployeeSearchResult[]> {
    const blindIndexes = await this.computeBlindIndexes(query.keyword)
    return this.repo.searchEmployees(query, blindIndexes)
  }

  /**
   * keyword からブラインドインデックスを算出する。
   *
   * - メールアドレスらしい形式 → emailHash を計算
   * - それ以外 → employeeCodeHash を計算（社員番号完全一致用）
   */
  private async computeBlindIndexes(keyword: string): Promise<BlindIndexes> {
    const trimmed = keyword.trim()
    if (trimmed.length === 0) {
      return { emailHash: null, employeeCodeHash: null }
    }

    // メールアドレス判定（簡易: @ を含む）
    const looksLikeEmail = trimmed.includes('@')
    const emailHash = looksLikeEmail
      ? await computeEmailHash(trimmed, this.appSecret)
      : null
    const employeeCodeHash = await computeEmployeeCodeHash(trimmed, this.appSecret)

    return { emailHash, employeeCodeHash }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createSearchService(deps: SearchServiceDeps): SearchService {
  return new SearchServiceImpl(deps)
}
