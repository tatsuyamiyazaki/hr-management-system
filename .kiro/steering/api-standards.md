# API 標準

全ドメインの API Routes で統一する命名・構造・レスポンス・エラー処理の標準。

## 哲学
- **予測可能性** — リソース指向で一貫した URL 設計
- **型安全** — Zod でリクエスト・レスポンスを両端検証
- **セキュア by Default** — 認証 → 認可 → バリデーションの順で早期拒否
- **破壊的変更を最小化** — フィールド追加はOK、削除・意味変更は新バージョン

## エンドポイントパターン

```
/api/{version}/{resource}[/{id}][/{sub-resource}]
```

例:
- `/api/v1/evaluations`
- `/api/v1/evaluations/:id`
- `/api/v1/evaluations/:id/responses`
- `/api/v1/users/:id/goals`

HTTPメソッド:
- **GET** — 読み取り（安全・冪等）
- **POST** — 作成・アクション実行
- **PUT** — 全置換更新
- **PATCH** — 部分更新
- **DELETE** — 削除（冪等）

## レスポンス形式

### 成功レスポンス
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "timestamp": "2026-04-15T10:00:00+09:00",
    "requestId": "req_abc123"
  }
}
```

### ページネーション付き成功
```json
{
  "success": true,
  "data": [ ... ],
  "error": null,
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "requestId": "req_abc123"
  }
}
```

### エラーレスポンス
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "評価コメントが必須です",
    "field": "comment",
    "details": { ... }
  },
  "meta": {
    "requestId": "req_abc123"
  }
}
```

## エラーコード体系

| コード | HTTPステータス | 用途 |
|--------|---------------|------|
| `UNAUTHORIZED` | 401 | 認証未実施・セッション期限切れ |
| `FORBIDDEN` | 403 | 認可エラー（ロール不足） |
| `NOT_FOUND` | 404 | リソース未検出 |
| `VALIDATION_ERROR` | 400 | 入力バリデーション失敗 |
| `CONFLICT` | 409 | 状態競合（例：評価期間外の送信） |
| `RATE_LIMITED` | 429 | レート制限到達 |
| `AI_TIMEOUT` | 503 | AI API タイムアウト |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー（詳細は非公開） |

**重要**: レスポンスに内部実装詳細（スタックトレース・SQL・ファイルパス）を含めない。

## ステータスコード

- **2xx 成功**: 200 取得/更新, 201 作成, 204 削除
- **4xx クライアント問題**: 400 バリデーション, 401/403 認証/認可, 404 未検出, 409 競合, 429 レート制限
- **5xx サーバー問題**: 500 汎用, 503 利用不可（AIタイムアウト含む）

## 認証

```
Authorization: Bearer {sessionToken}
```

または NextAuth のセッションCookie（同一オリジン）。

### 処理順序（middleware層）
1. セッション検証（無効なら 401 即時拒否）
2. ロール判定（必要ロール未満なら 403 即時拒否）
3. レート制限チェック（超過なら 429 即時拒否）
4. Zod バリデーション（失敗なら 400 即時拒否）
5. ビジネスロジック実行

## バージョニング

- **URLパスベース**: `/api/v1/...`, `/api/v2/...`
- **破壊的変更**: フィールド削除・意味変更・必須化 → 新バージョン
- **非破壊的変更**: フィールド追加・任意フィールド化 → 同バージョン
- **非推奨ウィンドウ**: 旧バージョンは最低6ヶ月並行提供してから削除

## ページネーション・フィルタ・ソート

### ページネーション
```
GET /api/v1/evaluations?page=1&pageSize=20
```
- デフォルト: page=1, pageSize=20
- 最大: pageSize=100
- 大規模リストはカーソルベース（`cursor` + `limit`）も検討

### フィルタ
```
GET /api/v1/evaluations?status=completed&cycleId=2026-q1
```
- 明示的なクエリパラメータのみ（自由なSQL条件は不可）

### ソート
```
GET /api/v1/evaluations?sort=createdAt:desc
```
- 複数ソート: `sort=priority:desc,createdAt:asc`

## リクエストID

- 全リクエストに `requestId`（UUID）を付与
- レスポンスヘッダー `X-Request-Id` と `meta.requestId` の両方に含める
- ログ・監査・エラー追跡の相関キーとして使用

## レート制限

| 対象 | 制限 |
|------|------|
| 全API | 1ユーザー / 100req/min |
| ログイン | 1IP / 10req/min |
| AI呼び出し | 1ユーザー / 20req/min |
| CSVエクスポート | 1ユーザー / 5req/min |

### 制限到達時
- ステータス: 429
- ヘッダー: `Retry-After: 60`（秒）
- エラーコード: `RATE_LIMITED`

## キャッシュ

- GET は条件付きキャッシュ（`ETag` + `If-None-Match`）
- ユーザー固有データは `Cache-Control: private`
- マスタデータは `Cache-Control: public, max-age=3600`

## CSVインポート・エクスポート

- **エクスポート**: `GET /api/v1/{resource}/export?format=csv`（非同期ジョブ → ダウンロードURL返却）
- **インポート**: `POST /api/v1/{resource}/import`（multipart/form-data, 検証後に非同期処理）
- 大規模処理は BullMQ ジョブで非同期実行、ジョブIDを返却してポーリング

## CORS

- 本番: 自社ドメインのみ許可（環境変数で明示）
- 開発: `localhost:3000` のみ許可
- `credentials: include` のため `Access-Control-Allow-Origin: *` は禁止

## API変更プロセス

1. RFC（設計書）をPRで提案
2. レビュー・承認
3. 新バージョン実装 / 既存バージョン非推奨マーク
4. クライアント移行期間（最低6ヶ月）
5. 旧バージョン廃止

---
_created: 2026-04-15 | パターンと決定に焦点。エンドポイントカタログは OpenAPI で別管理。_
