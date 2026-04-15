# Research & Design Decisions

## Summary

- **Feature**: `hr-management-platform`
- **Discovery Scope**: New Feature（greenfield、複数ドメイン統合）
- **Key Findings**:
  - モジュラモノリスが最適解（初期フェーズ・小規模チーム・単一デプロイ）
  - AIコーチング品質ゲートは同期呼び出し＋タイムアウト＋フォールバックが必須
  - 評価者匿名性はDB層とAPI層の分離で実現（DBに `evaluator_id` を保持、被評価者APIでは完全除外）
  - フィードバック変換・一括通知・集計はBullMQジョブで非同期化（パフォーマンスとリトライ両立）
  - 監査ログは Append-Only テーブル + DBロール権限で改竄を物理的に防止
  - 最低評価者数（デフォルト3）を設定し、下回る場合は公開保留で統計的匿名性を担保

---

## Research Log

### トピック1: アーキテクチャパターン選定

- **Context**: 20要件・19ドメインを持つプラットフォームを、初期フェーズで運用可能かつ拡張余地を残した構成で実装する必要がある
- **Sources Consulted**: Next.js 15 App Router ドキュメント・Modular Monolith パターン（Shopify事例）・DDD境界設計
- **Findings**:
  - マイクロサービスは初期フェーズでは過剰（運用コスト・分散トランザクション複雑性）
  - モジュラモノリスはドメイン境界を論理的に保ちつつ、単一デプロイで運用負荷を抑えられる
  - Next.js App Router の Route Handlers + Server Components で API とUI を同一コードベースで提供可能
- **Implications**: 本プロジェクトはモジュラモノリス採用。将来的な切り出し候補は `ai-coach`, `feedback`, `notification`

### トピック2: 360度評価の匿名性と統計的信頼性

- **Context**: 被評価者に「匿名性」を保証しつつ、評価スコアを公正に集計する必要がある
- **Sources Consulted**: 人事評価の心理学的匿名性研究・匿名化データマスキング技術
- **Findings**:
  - DB上では `evaluator_id` を保持（監査・HR_MANAGERの調査のため）
  - API境界で完全除外（被評価者向けレスポンスには evaluator 情報なし）
  - 最低評価者数（N=3）未満では「誰が書いたか推測できる」リスクが高いため公開を保留
  - マイルド化変換後の文章にも評価者特定可能な表現を残さないAI検証が必要
- **Implications**: 
  - Prismaスキーマで `evaluator_id` は `FeedbackResponse` テーブルに持つ
  - API Response DTO から明示的に除外（Zod で output schema を検証）
  - 最低評価者数チェックは集計時に実施

### トピック3: AIコーチング品質ゲート

- **Context**: 評価者が入力したコメントの品質をAIが判定し、基準を満たさない場合は「評価完了」をブロックする
- **Sources Consulted**: Anthropic Claude API ドキュメント・OpenAI Structured Outputs・LLMレスポンス時間ベンチマーク
- **Findings**:
  - Claude Haiku クラスでレイテンシは通常1-3秒、Sonnet で3-5秒
  - Structured Outputs (JSON mode) で `{"quality_ok": bool, "missing_aspects": [...], "suggestions": "..."}` を強制
  - タイムアウト5秒を超えた場合は同期呼び出しを中止し手動モードに退避
  - プロンプトキャッシュで共通システム指示のコストを削減
- **Implications**:
  - 同期API: `POST /api/v1/ai-coach/validate-comment`
  - Redisで同一入力のキャッシュ（TTL 5分、短め）
  - プロンプトキャッシュは Anthropic ephemeral cache を活用

### トピック4: フィードバックのマイルド化変換

- **Context**: 生の評価コメント群をネガティブ表現を建設的に書き換え、被評価者に公開する
- **Sources Consulted**: LLM による感情表現変換研究・BullMQ キューイング戦略
- **Findings**:
  - 変換は非同期で問題ない（評価期間終了 → 公開までに数時間〜1日の余裕）
  - BullMQ ジョブで被評価者ごとに1ジョブ化（粒度を適切に保つ）
  - 失敗時は指数バックオフリトライ（最大3回）、DLQで監視
  - HR_MANAGER のプレビュー承認ゲート必須
- **Implications**:
  - `lib/jobs/feedback-transform.ts` にジョブ定義
  - `FeedbackTransformResult` テーブルに変換前・変換後の両方を保存
  - プレビュー未承認のフィードバックは EMPLOYEE に公開されない状態管理

### トピック5: 監査ログの改竄防止

- **Context**: 人事情報の法定保持（7年）と改竄防止を両立する必要がある
- **Sources Consulted**: Append-Only テーブル設計・PostgreSQL RLS・イベントソーシング
- **Findings**:
  - PostgreSQL でアプリケーション用ロールに `INSERT` のみ許可し `UPDATE/DELETE` を禁止
  - `audit_logs` テーブルは専用ロールでのみ書き込み可能
  - 読み取りは ADMIN ロールのみ（別途行レベル制御）
  - 月次パーティショニングで大量データの管理性を向上
- **Implications**:
  - 別途DB マイグレーションで権限設定
  - Prisma スキーマに `@@map` で物理テーブル名を指定し、監査ログの論理削除モデルも禁止
  - 監査ログ発行は横断ドメインから `lib/audit-log/emit.ts` 経由のみ許可

### トピック6: 通知基盤とジョブキュー

- **Context**: メール・アプリ内通知を統一基盤で提供し、大量配信時も即時性を保つ必要がある
- **Sources Consulted**: Resend API / SendGrid API・BullMQ ジョブパターン
- **Findings**:
  - アプリ内通知は DB テーブルで管理、リアルタイム更新は SWR + Polling（初期）
  - メールは Resend 推奨（DX良好、コスト競争力、React Email テンプレート対応）
  - 一括配信（評価開始・リマインダー）は BullMQ で並列実行
  - 通知ユーザー設定は種別ごとに ON/OFF
- **Implications**:
  - `lib/notification/emit.ts` で種別・宛先・テンプレート指定の統一API
  - 実配信はジョブワーカーが行う（Fire-and-Forget）

### トピック7: 総合評価の計算ロジック

- **Context**: 業績点・目標達成点・360度評価点を加重平均し、等級判定する
- **Findings**:
  - 計算は評価サイクル終了後のバッチ処理で十分（リアルタイム性不要）
  - ウェイト w1+w2+w3 = 1.0 を強制し、正規化して計算
  - 社員個別のウェイト上書きは `TotalEvaluationOverride` テーブルに別管理
  - 境界線判定は閾値 ±3% 以内で「注意フラグ」
- **Implications**:
  - `lib/jobs/total-evaluation-calc.ts` で全社員分を並列計算
  - HR_MANAGERプレビュー → 確定フローを State Machine 化

### トピック8: 3Dネットワーク図（Phase 2）

- **Context**: スキルネットワークの3D可視化
- **Findings**:
  - Three.js + react-three-fiber が標準
  - 社員数100名規模までは WebGL 描画で十分
  - 1000名超ではノード間引きアルゴリズムが必要
  - Phase 2 送りで問題なし（MVP優先度低）

---

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Microservices | ドメイン別に独立サービス化 | 独立デプロイ・技術選定自由 | 運用コスト・分散トランザクション・初期学習コスト | 初期段階では過剰 |
| Modular Monolith | 単一デプロイ・ドメイン境界を論理分離 | 開発速度・低運用コスト・リファクタ容易 | 技術選定の統一が必要 | **選択** |
| Serverless Functions | 機能ごとに Lambda/Edge Function | スケーリング自動 | 状態管理・DB接続プール・コールドスタート | 特定機能（AI）で部分採用検討 |
| Layered Monolith | 伝統的なMVC・レイヤー分離 | シンプル | ドメイン境界が曖昧になりやすい | 却下 |

---

## Design Decisions

### Decision: モジュラモノリス採用
- **Context**: 19ドメイン・小規模チーム・段階的リリース
- **Alternatives Considered**:
  1. マイクロサービス — 運用コスト・複雑性が過剰
  2. フラットモノリス — ドメイン境界が保てない
- **Selected Approach**: Next.js App Router + 19ドメインの論理モジュール分離
- **Rationale**: 単一デプロイで運用負荷を抑えつつ、ドメイン境界をコード規約で保つ
- **Trade-offs**: スケール限界あり（推定10万ユーザー規模まで）が、本プロジェクトは大企業1社の社員規模（〜数千人）を想定
- **Follow-up**: 将来的に `ai-coach`・`feedback` を独立サービス化する余地を残す

### Decision: AI呼び出しの集約とキャッシュ
- **Context**: AI API のコストとレイテンシを制御
- **Alternatives Considered**:
  1. 各ドメインから直接AI呼び出し — コスト増・監視困難
  2. AI専用サービス層 — 過剰
- **Selected Approach**: `lib/ai-coach/` と `lib/feedback/` のみから呼び出し、`lib/ai-monitoring/` で使用量を記録、Redisで同一入力キャッシュ
- **Rationale**: 呼び出し集約で監視・コスト制御を容易化
- **Trade-offs**: 呼び出し元の自由度が下がるが、統制とのトレードオフで許容
- **Follow-up**: プロンプトキャッシュと結果キャッシュのヒット率を実測

### Decision: 評価匿名性のDB層/API層分離
- **Context**: 監査性と匿名性を両立
- **Alternatives Considered**:
  1. DB に evaluator_id を保持しない — 監査・不正検知が不可能
  2. 完全匿名化 — 同上
- **Selected Approach**: DBに evaluator_id を保持、API境界で除外
- **Rationale**: 業務上の監査要件と被評価者の心理的安全性を両立
- **Trade-offs**: API実装のバグで漏洩するリスク → Zod output schema で検証
- **Follow-up**: E2Eテストで匿名性保証の回帰検知

### Decision: 監査ログを Append-Only + DB権限で保護
- **Context**: 改竄防止の物理的保証
- **Alternatives Considered**:
  1. アプリ層のみで制御 — バグやバックドア経由で改竄リスク
  2. 外部 SIEM へ即時送信 — オーバーキル
- **Selected Approach**: アプリ用DBロールは `audit_logs` に INSERT のみ、ADMIN 専用の読み取り専用ロールで参照
- **Rationale**: アプリケーションにバグがあっても物理的に改竄不可
- **Trade-offs**: マイグレーション時の権限管理が必要
- **Follow-up**: 定期的なログ整合性チェック（ハッシュチェーン等）は将来拡張で検討

### Decision: BullMQ 非同期ジョブの採用
- **Context**: AI処理・一括通知・集計のスケーラビリティ
- **Alternatives Considered**:
  1. 同期処理 — タイムアウトと UX 劣化
  2. Next.js Server Actions のみ — リトライ・ジョブ管理機能不足
  3. AWS SQS / Cloud Tasks — ベンダーロックイン
- **Selected Approach**: BullMQ（Redis バックエンド）でジョブキュー
- **Rationale**: Next.js 内に worker 同梱可能、ダッシュボード（Bull Board）で監視容易、リトライ・DLQ 標準装備
- **Trade-offs**: Redis に依存（既にセッション用に導入済みのため共用可）
- **Follow-up**: 本番ではワーカープロセスをアプリと分離してデプロイ

### Decision: 最低評価者数 N=3 の設定
- **Context**: 統計的匿名性の担保
- **Alternatives Considered**:
  1. N=2 — 片方を除外すれば特定可能
  2. N=5 — 小規模チームでは達成困難
- **Selected Approach**: デフォルト N=3、HR_MANAGERが評価サイクル作成時に変更可
- **Rationale**: 3名以上あれば個人特定が著しく困難、かつ現実的な運用ハードルとバランス
- **Trade-offs**: 小チームでは代替評価者割り当ての手間が発生 → Req 8.11 で対応
- **Follow-up**: 運用開始後に分布を分析し、閾値を調整

---

## Risks & Mitigations

- **リスク1: AI API のコスト膨張** — 使用量記録・月次予算アラート・キャッシュ活用・結果の重複防止
- **リスク2: 評価者情報の漏洩（匿名性の破壊）** — Zod Output Schema で評価者ID除外を検証・E2Eテスト・監査ログで追跡
- **リスク3: 監査ログの改竄** — DB権限分離・Append-Only 設計・ADMIN ロール以外は読み取りも制限
- **リスク4: BullMQ ジョブの失敗による評価未公開** — リトライ + DLQ 監視・HR_MANAGER への失敗通知
- **リスク5: パスワード流出時の被害拡大** — bcrypt Cost 12 + 2FA（Phase 2）・セッション管理・5回失敗ロックアウト
- **リスク6: 評価サイクル中の入退社による混乱** — Req 8.18/8.19 で明確に除外ルール定義
- **リスク7: 大規模組織でのパフォーマンス劣化** — 非同期ジョブ・インデックス戦略・クエリ最適化・負荷試験
- **リスク8: 3Dネットワーク図の実装工数** — Phase 2 に分離し、MVP リスクから除外

---

## References

- [Next.js 15 App Router Docs](https://nextjs.org/docs/app) — フレームワーク設計の前提
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference) — データモデリング
- [BullMQ Documentation](https://docs.bullmq.io/) — ジョブキュー設計
- [Anthropic Claude API](https://docs.anthropic.com/) — AI コーチング実装の基準
- [NextAuth.js v5 Guide](https://authjs.dev/) — 認証実装
- [Resend React Email](https://resend.com/docs/send-with-react-email) — メール通知テンプレート
- [PostgreSQL Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — 監査ログ保護の参考
