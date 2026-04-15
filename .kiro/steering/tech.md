# 技術スタック

## アーキテクチャ

フルスタック Next.js（App Router）をベースとしたモノリシック構成。
APIは Next.js Route Handlers で提供し、AIサービスと通知サービスのみ外部連携。
初期フェーズは単一リポジトリで開発し、スケール要件に応じてマイクロサービス化を検討。

```
Browser (React/Next.js)
    ↕ HTTPS
Next.js App Router (UI + API Routes)
    ├── PostgreSQL (via Prisma) — 永続データ
    ├── Redis — セッション・レート制限・キャッシュ
    ├── Claude API / OpenAI API — AIコーチング・FB変換・要約
    ├── Resend / SendGrid — メール通知
    └── Meilisearch / PostgreSQL FTS — 社員検索
```

## コア技術

- **言語**: TypeScript 5.x（`strict: true`、`any` 禁止）
- **フレームワーク**: Next.js 15（App Router）
- **ランタイム**: Node.js 22+
- **ORM**: Prisma 6.x（型安全なDB操作）
- **DB**: PostgreSQL 16（評価データ・組織データの永続化）
- **キャッシュ/セッション**: Redis 7.x（レート制限・セッション・非同期ジョブキュー）
- **認証**: NextAuth.js v5 / Auth.js（セッション管理・RBAC）

## 主要ライブラリ

| カテゴリ | ライブラリ | 用途 |
|---------|-----------|------|
| UI | shadcn/ui + Tailwind CSS 4 | デザインシステム |
| フォーム | React Hook Form + Zod | バリデーション付きフォーム |
| 状態管理 | TanStack Query v5 | サーバー状態管理 |
| AI | Anthropic Claude SDK / OpenAI SDK | コーチング対話・FB変換・要約 |
| チャート | Recharts + Three.js | 2Dチャート + 3Dネットワーク図 |
| メール | Resend / SendGrid | 通知メール送信 |
| ジョブキュー | BullMQ（Redis） | AI処理・一括通知の非同期実行 |
| 検索 | PostgreSQL FTS（初期）/ Meilisearch（拡張） | 社員検索 |
| テスト | Vitest + Playwright | ユニット・E2E テスト |

## AI 利用方針

- **用途**:
  - 対話型品質ゲート（評価コメントの具体性・価値観関連性の判定）
  - 評価コメントのマイルド化変換（ネガティブ → 建設的）
  - コメント群の要約（全体的な強み・改善点のサマリー）
- **個人情報除外**: AI API送信前に氏名・社員番号をプロンプトから除去
- **モデル切替可能設計**: 設定変更のみで AIモデル・プロバイダを切り替え可能
- **コスト監視**: トークン使用量のログ記録・アラート閾値設定
- **フォールバック**: AI API のタイムアウト（5秒）時は手動モードに退避

## 開発標準

### 型安全
- TypeScript `strict: true` 必須
- `any` 型禁止（`unknown` を使用）
- Prisma スキーマから型を自動生成
- Zod でランタイムバリデーション

### コード品質
- ESLint + Prettier（コミット前に自動実行）
- `max-lines: 300` をファイル上限の目安
- 関数は単一責任（50行以内を目標）

### テスト
- Vitest でユニット・統合テスト（カバレッジ 80%+）
- Playwright でクリティカルユーザーフロー E2E テスト
- AI生成コンテンツはモック・スナップショットテスト

## 開発環境

### 必要ツール
- Node.js 22+
- pnpm 9+（パッケージマネージャー）
- Docker Desktop（PostgreSQL + Redis ローカル起動）
- Git 2.40+

### 一般コマンド
```bash
# Dev: pnpm dev
# Build: pnpm build
# Test: pnpm test
# E2E: pnpm test:e2e
# DB マイグレーション: pnpm prisma migrate dev
# DB Studio: pnpm prisma studio
```

## 可用性・運用

### 稼働率 / SLO
- 月次稼働率 99.5% 以上（Req 20.20）
- RTO: 4時間以内（Req 20.17）
- RPO: 24時間以内（Req 20.17）
- 四半期に1回の復旧訓練（Req 20.18）

### バックアップ
- PostgreSQL 日次自動バックアップ・7日間保持
- 監査ログは7年間保持（改竄防止のため追記のみ）
- AIコスト記録は長期保持（運用分析のため）

### 非同期ジョブ処理（BullMQ）
重い処理は必ず非同期ジョブに退避する:
- AI フィードバック変換・要約生成
- 一括通知送信（評価開始・リマインダー）
- CSV インポート・エクスポート
- 総合評価の集計計算

### 監視・アラート
- AI 月次コスト: 予算の 80% で WARN、100% で CRITICAL
- 可用性: 99.5% を下回ったら ADMIN 通知
- ログイン失敗・権限エラー・レート制限到達をセキュリティ監視に連携

## 主要技術決定

| 決定 | 根拠 |
|------|------|
| Next.js App Router | RSCによるパフォーマンス最適化・型安全なルーティング |
| Prisma | TypeScriptとの親和性・マイグレーション管理の容易さ |
| TanStack Query | サーバー状態の楽観的更新・キャッシュ戦略 |
| shadcn/ui | コンポーネントをコードとして所有・アクセシビリティ準拠 |
| Redis | セッション共有・レート制限・非同期ジョブ基盤・AIレスポンスキャッシュの統一 |
| BullMQ | AI処理・一括通知・集計のリトライ・並列制御・失敗時のDLQ管理 |
| PostgreSQL FTS（初期） | 外部依存を最小化し、必要になった段階で Meilisearch へ移行 |
| 監査ログは追記のみテーブル | 改竄防止のため UPDATE/DELETE を権限レベルで禁止 |
| pnpm | モノレポ対応・高速インストール |

---
_created: 2026-04-15 | updated: 2026-04-15（要件書同期：可用性・SLO・非同期ジョブ・監視セクション追加） | 標準とパターンを記述。全依存関係のリストではない_
