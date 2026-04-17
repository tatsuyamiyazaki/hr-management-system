# Implementation Plan

Phase 1（MVP）を対象とした実装タスク。Phase 2（2FA/SSO/3Dネットワーク図/多言語）は別スプリントで対応する。
並列実行可能なタスクには `(P)` マーカーを付与。基盤タスク（1〜6）の完了後、多くのドメインタスクが並列実行可能となる。

---

## Phase A: 基盤構築（Foundation）

- [ ] 1. プロジェクト基盤のセットアップ
- [x] 1.1 Next.js 15 + TypeScript 5 strict のリポジトリ初期化
  - Next.js App Router で新規プロジェクトを作成し、`strict: true` と `any` 禁止の ESLint ルールを有効化
  - pnpm ワークスペース・Prettier・Husky でコミット前フックを整備
  - `@/` パスエイリアスを `src/` に設定
  - `.env.example` を作成し、DB・Redis・AI・Email の接続情報を網羅
  - _Requirements: 20.1, 20.10, 20.11, 20.12_

- [x] 1.2 Docker Compose で開発用 PostgreSQL 16 と Redis 7 を起動
  - PostgreSQL に pgcrypto・pg_trgm 拡張を有効化
  - Redis をセッション・レート制限・BullMQ で共用する構成
  - ローカル開発用の接続確認スクリプトを整備
  - _Requirements: 20.1, 20.16_

- [x] 1.3 Prisma 6 の初期化とベースモデル定義
  - Prisma スキーマに User・Session・PasswordHistory・Profile を定義
  - マイグレーションでpgcrypto 拡張をインストールし、機微カラムに `pgp_sym_encrypt` を適用
  - ブラインドインデックス `emailHash` / `employeeCodeHash` の HMAC ユーティリティを共有層に配置
  - Prisma Client 拡張で暗号化/復号を透過的に処理
  - _Requirements: 20.4, 20.5_

- [x] 1.4 共有ユーティリティと型基盤の整備
  - ドメインエラー判別共用体（DomainError）と Result 型を実装
  - DomainError → HTTP ステータス・API エラーコードのマッパーを共有層に配置
  - API レスポンス統一形式（success/data/error/meta）のラッパーを提供
  - Zod の output strict 検証パターンをヘルパー化
  - _Requirements: 20.9_

- [x] 1.5 テスト環境の整備
  - Vitest でユニット/統合テストを実行できる構成
  - Playwright で E2E テストを実行できる構成
  - テスト用 DB のセットアップ・ティアダウンスクリプト
  - カバレッジ 80% を CI で検証する設定
  - _Requirements: 20.1_

---

## Phase B: 横断基盤（Cross-cutting Infrastructure）

- [ ] 2. 監査ログ・アクセスログ基盤の構築
- [x] 2.1 監査ログのAppend-Only構造を実装
  - AuditLog テーブルに INSERT 専用の DB ロールを設定し UPDATE/DELETE を物理的に禁止
  - 月次パーティショニングで 7 年保持を実現
  - 共通 AuditLogEmitter を実装し、全ドメインから非同期で呼び出せる API を提供
  - 変更差分（before/after JSON）の記録パターンを確立
  - _Requirements: 17.1, 17.2, 17.3, 17.5, 17.7_

- [x] 2.2 アクセスログミドルウェアと自動ローテート
  - 全 `/api/**` リクエストに対してアクセスログを非同期記録
  - 12ヶ月経過パーティションを日次 cron でドロップする仕組みを整備
  - ADMIN 向けの参照 API と CSV エクスポート（非同期ジョブ）を実装
  - _Requirements: 17.6, 17.8_

- [ ] 3. 非同期ジョブ基盤と共通エクスポート/インポート
- [x] 3.1 BullMQ ワーカーの共通基盤を構築
  - Redis ベースの BullMQ セットアップ・指数バックオフリトライ・DLQ 監視
  - Bull Board による管理 UI を ADMIN のみに公開
  - ワーカーとアプリケーションを分離デプロイできる構成
  - _Requirements: 20.4_

- [x] 3.2 (P) 共通 ExportJob の実装
  - CSV/PDF の非同期エクスポート基盤（ジョブID返却→ポーリング→署名付き URL）
  - Blob ストレージ（S3/R2 相当）へのアップロードと 24 時間有効な署名URL生成
  - 各ドメインから ExportRequest のバリアントで依頼できる API
  - _Requirements: 2.7, 3.8, 13.4, 17.8_

- [x] 3.3 (P) 共通 ImportJob の実装
  - CSV アップロード（multipart）→ バリデーション → ジョブ投入 → 結果レポート
  - エラー行の詳細付き結果を返却
  - _Requirements: 2.7, 14.1_

- [ ] 4. 通知基盤の構築
- [x] 4.1 通知モデルと NotificationEmitter の実装
  - Notification / NotificationPreference / NotificationLog の永続化
  - 全ドメインから呼び出し可能な NotificationEmitter（Fire-and-Forget）
  - カテゴリベースの配信先・チャネル判定ロジック
  - _Requirements: 15.1, 15.2, 15.4, 15.7_

- [x] 4.2 (P) メール配信ワーカー（EmailWorker）
  - Resend + React Email テンプレートで通知メールを送信
  - 最大3回の指数バックオフリトライと失敗ログ記録
  - _Requirements: 15.4, 15.5_

- [x] 4.3 (P) アプリ内通知 API と既読管理
  - ユーザー別の通知一覧・未読バッジ更新
  - カテゴリ別通知設定のON/OFF（メールのみ、アプリ内は常時有効）
  - _Requirements: 15.3, 15.6_
    x] 4.4 カスタムブロードキャスト送信機能
  - HR_MANAGER / ADMIN ロールのみが全社員または特定グループへ送信
  - middleware でロール判定、監査ログに送信内容を記録
  - _Requirements: 15.8_

- [ ] 5. AI 連携基盤の構築
- [x] 5.1 AIGateway と Provider 抽象化
  - Anthropic Claude SDK / OpenAI SDK の共通インターフェース実装
  - 環境変数 `AI_PROVIDER` で切替・プロンプトキャッシュ対応
  - Redis による同一入力レスポンスキャッシュ（TTL 5分）
  - 個人識別情報（氏名・社員番号）の匿名化ユーティリティ
  - _Requirements: 9.8, 20.13_

- [x] 5.2 (P) AIUsageRecord 記録と AIMonitoringService
  - 全 AI 呼び出しのトークン使用量・推定コスト・レイテンシを記録
  - 月次/週次/日次のコスト集計クエリ
  - ユーザー別異常検知（通常の5倍超）
  - _Requirements: 19.1, 19.2, 19.5, 19.6, 19.8_

- [x] 5.3 AI 予算アラートと非クリティカル機能停止
  - AIBudgetConfig の閾値管理（80% WARN / 100% CRITICAL）
  - 閾値到達で ADMIN にアラート通知
  - 予算 100% 到達で要約生成等の非クリティカル機能を自動停止
  - _Requirements: 19.3, 19.4_

- [x] 5.4 (P) AI 運用ダッシュボード
  - コスト推移・プロバイダ切替比較・失敗率を表示
  - ADMIN のみアクセス可能
  - _Requirements: 19.2, 19.6, 19.7_

- [ ] 6. 認証・認可基盤の実装（Phase 1）
- [ ] 6.1 NextAuth v5 によるログイン・セッション管理
  - Credentials Provider でメール + パスワード認証
  - bcrypt コスト12以上でパスワードハッシュ化
  - Redis セッションストアで8時間有効期限・30分アイドルタイムアウト
  - emailHash（HMAC）で完全一致ログイン
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.11_

- [ ] 6.2 パスワードポリシーとロックアウト
  - 12文字以上・3種文字混在・過去5世代チェック
  - 5回連続失敗で15分アカウントロック・ロック通知メール
  - _Requirements: 1.3, 1.12, 1.13_

- [ ] 6.3 (P) ロールベースアクセス制御（RBAC）middleware
  - ADMIN / HR_MANAGER / MANAGER / EMPLOYEE の4ロール判定
  - URL ルート単位・サービス層・DB層の三層防御
  - 403 拒否時の監査ログ記録
  - _Requirements: 1.7, 1.8, 1.9_

- [ ] 6.4 セッション一覧と手動失効機能
  - ユーザーが自分の全セッション（デバイス・IP・最終アクセス）を参照
  - 任意のセッションを手動で失効できる UI / API
  - _Requirements: 1.14, 1.15_

- [ ] 6.5 ユーザー招待・パスワード設定フロー
  - ADMIN の新規ユーザー作成で招待メール送信
  - 招待トークンでの初回パスワード設定
  - _Requirements: 1.10_

---

## Phase C: ドメインサービス（基盤後に多くが並列実行可能）

- [ ] 7. (P) マスタ管理の実装
- [ ] 7.1 スキル・役職・等級マスタの CRUD
  - SkillMaster の登録・編集・廃止（既存データ保持・新規選択肢から除外）
  - RoleMaster と RoleSkillRequirement の管理
  - GradeMaster と評価ウェイト（w1+w2+w3=1 検証）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 7.2 マスタ変更の監査ログ連携
  - 等級ウェイト変更時の変更前後 JSON 記録（GradeWeightHistory）
  - マスタCRUD操作の監査ログ発行
  - _Requirements: 2.6_

- [ ] 7.3 マスタ CSV インポート/エクスポート
  - 共通 ImportJob / ExportJob 基盤を利用
  - バリデーションエラー行の詳細レポート
  - _Requirements: 2.7_

- [ ] 8. (P) 組織体制管理の実装
- [ ] 8.1 組織ツリーとポジション管理
  - Department・Position を階層管理し循環参照を検出
  - 部署移動時の TransferRecord 自動記録
  - CSV エクスポート（共通 ExportJob 利用）
  - _Requirements: 3.3, 3.4, 3.6, 3.7, 3.8_

- [ ] 8.2 組織図ビューア・編集 UI（DnD）
  - インタラクティブな組織図表示（HR_MANAGER 編集可）
  - ノードのドラッグ＆ドロップでプレビュー→確定
  - MANAGER 向け直属メンバー一覧ビュー
  - _Requirements: 3.1, 3.2, 3.5_

- [ ] 9. (P) 社員ライフサイクル・プロフィール管理
- [ ] 9.1 社員データの一括インポートと初期登録
  - CSV アップロードから共通 ImportJob を起動
  - 新規社員に入社日・配属部署・役職・初期ロールを必須で登録
  - _Requirements: 14.1, 14.9_

- [ ] 9.2 社員ステータス管理（在籍/休職/退職/入社予定）
  - 休職・退職時に進行中の評価対象・評価者から自動除外
  - 退職日以降のログイン拒否・評価依頼無効化
  - _Requirements: 14.2, 14.3, 14.4_

- [ ] 9.3 プロフィール編集と閲覧範囲制御
  - ProfileService で氏名・写真・連絡先・自己紹介等を管理
  - 閲覧者ロール別の公開範囲制御（ADMIN: 全項目、他: 基本情報のみ）
  - _Requirements: 14.5, 14.6_

- [ ] 9.4 退職者データの匿名化と個人情報削除要求対応
  - 7年経過後の退職者データ自動匿名化ジョブ
  - 本人/法定代理人からの削除要求フロー
  - 法定保持期間中の項目と削除可能項目を識別
  - _Requirements: 14.7, 14.8_

- [ ] 10. (P) 社員検索機能
- [ ] 10.1 PostgreSQL FTS による社員検索
  - Profile.firstName/lastName/Kana を平文で FTS 対象に
  - pg_trgm + tsvector + GIN インデックスで部分一致
  - 氏名・社員番号・メール（ブラインド一致）・部署・役職で検索
  - _Requirements: 16.1, 16.2, 16.5_

- [ ] 10.2 フィルター・制限とレート制限
  - 部署・役職・ステータスフィルタ
  - 退職/休職社員のデフォルト除外
  - 検索専用レート制限 60 req/min/user の適用
  - _Requirements: 16.3, 16.4, 16.6_

- [ ] 11. (P) スキルマップの実装（Phase 1：2D）
- [ ] 11.1 共有 SkillGapCalculator の実装
  - 役職要件と保有スキルの差分計算を純関数で提供
  - 充足率（0.0〜1.0）の算出ロジック
  - _Requirements: 4.6, 4.7, 4.8_

- [ ] 11.2 社員スキル登録とマネージャー承認
  - EMPLOYEE によるスキル登録・更新（レベル 1〜5）
  - MANAGER による承認・未承認スキルの視覚的区別
  - _Requirements: 4.4, 4.5_

- [ ] 11.3 組織サマリー・ヒートマップ・レーダー
  - 組織全体のスキル充足率サマリー
  - 部署×スキルカテゴリのヒートマップ描画（Recharts）
  - 個人スキルのレーダーチャート
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 11.4 ポスト候補者リストと採用アラート
  - 役職要件に対する候補者一覧とスキル充足率
  - 充足率が閾値（デフォルト60%）を下回るポストの自動アラート
  - 組織目標に対するスキルギャップランキング
  - _Requirements: 4.6, 4.7, 4.8_

- [ ] 12. (P) キャリア管理の実装
- [ ] 12.1 キャリア希望の登録と履歴管理
  - EMPLOYEE が希望役職・希望時期・コメントを登録
  - 更新時に旧希望を supersededAt で履歴保持
  - HR_MANAGER 以上のみ参照可能な権限制御
  - _Requirements: 5.2, 5.6, 5.7_

- [ ] 12.2 キャリアマップとギャップ表示
  - 組織内の役職一覧・キャリアパスの可視化
  - 現役職と希望役職間のスキルギャップ表示（SkillGapCalculator 利用）
  - MANAGER 向け部下のキャリア希望一覧
  - _Requirements: 5.1, 5.3, 5.4_

- [ ] 12.3 組織全体のキャリア希望集計
  - HR_MANAGER 向け希望役職分布・充足予測ダッシュボード
  - _Requirements: 5.5_

- [ ] 13. (P) 目標管理（OKR/MBO）の実装
- [ ] 13.1 多階層目標ツリーの実装
  - 組織→部門→チーム→個人の親子関係を保持
  - OrgGoal / PersonalGoal / GoalProgressHistory のモデル化
  - OKR と MBO の両形式サポート
  - _Requirements: 6.1, 6.2, 6.10_

- [ ] 13.2 個人目標登録と上長承認フロー
  - EMPLOYEE が定量・定性指標を含む個人目標を登録
  - 承認ステートマシン（Draft→PendingApproval→Approved/Rejected→InProgress→Completed）
  - 通知経由で MANAGER に承認依頼
  - _Requirements: 6.3, 6.4, 6.5_

- [ ] 13.3 進捗更新と部下の目標一覧
  - 進捗率 0〜100% と自己評価コメントを履歴記録
  - MANAGER が部下の目標・進捗・承認状態を一覧閲覧
  - _Requirements: 6.6, 6.7_

- [ ] 13.4 目標期限アラートの定期ジョブ
  - BullMQ 定期ジョブ（毎日 09:00 JST）で scanDeadlineAlerts を実行
  - 期限 7 日以内かつ進捗 50% 未満を検出し通知
  - 同一目標の重複通知を避ける（期限3日前・1日前・当日）
  - _Requirements: 6.8_

- [ ] 13.5 評価サイクルとの目標達成率連携
  - 評価期間終了時に達成率（定量・定性）を評価データへ連携
  - _Requirements: 6.9_

- [ ] 14. (P) 1on1ログ・予定管理
- [ ] 14.1 1on1 予定登録と通知
  - MANAGER が予定日時・所要時間・アジェンダを登録
  - 対象部下に予定通知
  - _Requirements: 7.1, 7.2_

- [ ] 14.2 1on1ログのタイムライン表示
  - チャット形式に近い時系列 UI で過去のログを表示
  - 議題・議事内容・ネクストアクション・公開範囲を保存
  - EMPLOYEE は「本人開示可」のログのみ閲覧
  - _Requirements: 7.3, 7.4, 7.5_

- [ ] 14.3 ログ未入力リマインダーと評価フォーム連携
  - 30日以上ログがない部下を検出する定期ジョブ
  - 評価フォーム内への対象期間 1on1 ログへの参照リンク表示
  - HR_MANAGER 以上が全 1on1 ログを参照可能
  - _Requirements: 7.6, 7.7, 7.8_

---

## Phase D: 360度評価コア機能

- [ ] 15. 360度評価サイクル管理の実装
- [ ] 15.1 共有 EvaluationEventBus の構築
  - Redis Pub/Sub ベースのイベントバス
  - EvaluationSubmitted / CycleFinalized / FeedbackPublished イベント定義
  - Subscriber 登録 API
  - _Requirements: 8, 10, 11（疎結合化の基盤）_

- [ ] 15.2 評価サイクルの作成・開始・状態管理
  - CycleService のステートマシン（DRAFT → ACTIVE → AGGREGATING → PENDING_FEEDBACK_APPROVAL → FINALIZED → CLOSED）
  - サイクル名・期間・項目・インセンティブ係数 k・最低評価者数・最大対象者数の設定
  - 全対象社員への評価開始通知
  - _Requirements: 8.1, 8.2_

- [ ] 15.3 評価対象者選択と辞退・代替評価者
  - 社員検索を介した評価対象追加
  - 1評価者あたりの最大対象者数上限チェック
  - 辞退理由記録と代替評価者割り当てフロー
  - _Requirements: 8.3, 8.4, 8.10, 8.11, 8.12_

- [ ] 15.4 自己評価とピア評価の受付
  - 「価値観体現・経営貢献」1軸・80点基準
  - SelfEvaluation と EvaluationResponse の保存
  - 評価送信後に EvaluationSubmitted イベント発行
  - 上司評価（TOP_DOWN）とピア評価（PEER）の区別
  - _Requirements: 8.5, 8.6, 8.7, 8.17_

- [ ] 15.5 匿名性保証の実装
  - 被評価者向け DTO から evaluatorId を Zod strict で除外
  - E2Eテストで評価者ID非露出を自動検証
  - _Requirements: 8.7, 20.6_

- [ ] 15.6 進捗表示とリマインダー
  - getCycleProgress（HR向け全体）・getEvaluatorProgress（個人）API
  - 締切3日前の未提出者への自動リマインダー
  - _Requirements: 8.8, 8.9_

- [ ] 15.7 サイクル途中の入退社扱いと集計
  - 在籍期間50%未満の入社者を被評価者から除外
  - 退職日以降の評価依頼を無効化
  - 最低評価者数未満の場合 MinimumNotMetFlag で公開保留
  - サイクル終了時の集計と CycleFinalized イベント発行
  - _Requirements: 8.13, 8.14, 8.15, 8.16, 8.18, 8.19_

- [ ] 16. AI コーチング（対話型品質ゲート）の実装
- [ ] 16.1 品質ゲート AI プロンプトと判定ロジック
  - 具体性（エピソード有無）と価値観関連性の判定
  - 個人情報匿名化プロンプトビルダー
  - 3秒 SLA を目標・5秒ハードタイムアウト
  - タイムアウト時の手動モード切替
  - _Requirements: 9.2, 9.4, 9.7, 9.8_

- [ ] 16.2 対話型入力 UI（チャットボット形式）
  - 評価フォーム内のチャット UI
  - 品質NGで「評価完了」ボタンを無効化
  - AI判定中のローディング・入力欄は編集可能
  - _Requirements: 9.1, 9.3, 9.5, 9.6_

- [ ] 16.3 対話ログ保存と品質ゲート通過判定
  - AICoachLog に対話ターン・判定結果・最終コメントを保存
  - 品質ゲート通過フラグ（qualityGatePassed）を EvaluationResponse と EvaluationSubmitted イベントに伝搬
  - _Requirements: 9.9_

- [ ] 17. フィードバック変換・公開の実装
- [ ] 17.1 CycleFinalized 購読とマイルド化変換ジョブ
  - EvaluationEventBus の CycleFinalized をトリガに FeedbackService.scheduleTransform を起動
  - 被評価者単位の BullMQ ジョブ化
  - AIGateway でネガティブ表現を建設的表現に変換
  - _Requirements: 10.1, 10.2_

- [ ] 17.2 FB要約生成と変換結果の保存
  - コメント群から強み・改善点のサマリーを200〜300字で生成
  - FeedbackTransformResult に生データと変換後を両方保存
  - 生データは HR_MANAGER 以上のみ参照可能
  - _Requirements: 10.3, 10.5_

- [ ] 17.3 HR_MANAGER プレビュー承認と公開
  - 公開前のプレビュー・承認画面
  - 承認後に被評価者のマイページで閲覧可能
  - 評価者名は DTO から除外（匿名閲覧）
  - _Requirements: 10.4, 10.6_

- [ ] 17.4 閲覧確認と公開後アーカイブ
  - 被評価者の確認日時（viewedAt）記録
  - 公開から2年経過でアーカイブ状態に変更する定期ジョブ
  - _Requirements: 10.7, 10.8, 10.9_

- [ ] 18. 評価者インセンティブの実装
- [ ] 18.1 EvaluationSubmitted 購読とインセンティブ加算
  - Subscriber として EvaluationSubmitted を購読
  - qualityGatePassed=true のみ加算対象
  - IncentiveRecord に加算記録（responseId unique で重複防止）
  - _Requirements: 11.1, 11.2, 11.3, 11.6_

- [ ] 18.2 マイページでの実施件数とスコア表示
  - 現在のサイクルの評価実施件数と累積スコアを表示
  - 総合評価集計時に360度評価点への加算用スコア提供
  - _Requirements: 11.4, 11.5_

- [ ] 19. 総合評価の実装
- [ ] 19.1 加重平均計算とプレビュー
  - 業績 × w1 + 目標 × w2 + 360度（インセンティブ加算後）× w3 の計算
  - 等級マスタのデフォルトウェイトを適用
  - 全社員分を BullMQ ジョブで並列計算
  - 確定前プレビュー画面で内訳を表示
  - _Requirements: 12.1, 12.2, 12.4_

- [ ] 19.2 個別ウェイト上書きと等級境界フラグ
  - HR_MANAGER による個別ウェイト手動調整
  - TotalEvaluationOverride に調整理由とともに記録・監査ログ連携
  - 等級閾値の±3%境界を注意フラグ表示
  - _Requirements: 12.3, 12.6_

- [ ] 19.3 確定・クローズと ADMIN 修正
  - 全社員の総合評価確定とサイクルクローズ
  - 確定後の修正は ADMIN のみ、TotalEvaluationCorrection に記録
  - _Requirements: 12.5, 12.7_

- [ ] 20. 異議申立てプロセスの実装
- [ ] 20.1 異議申立て送信と期限チェック
  - 公開フィードバック/総合評価への異議申立てボタン
  - 公開日から14日以内の期限チェック
  - Appeal への対象評価・理由・希望対応を記録し HR_MANAGER に通知
  - _Requirements: 18.1, 18.2, 18.3_

- [ ] 20.2 HR_MANAGER 審査フロー
  - 未対応異議申立て優先表示の一覧画面
  - ステートマシン（Submitted → UnderReview → Accepted/Rejected/Withdrawn）
  - 審査結果と理由の申立者への通知
  - _Requirements: 18.4, 18.5_

- [ ] 20.3 認容時の再計算と履歴保持
  - Accepted 時に総合評価再計算プロセスを自動起動
  - 異議申立て履歴を 7 年間保持
  - 監査ログ連携
  - _Requirements: 18.6, 18.7_

---

## Phase E: ダッシュボードと運用

- [ ] 21. ダッシュボード & レポートの実装
- [ ] 21.1 ロール別 KPI ダッシュボード
  - ADMIN/HR_MANAGER: 全社KPI（社員数・評価完了率・目標達成率・スキルカバレッジ）
  - MANAGER: 担当メンバー限定のKPI
  - EMPLOYEE: 自分の評価・目標・スキル・インセンティブ
  - Empty State ガイドメッセージ
  - _Requirements: 13.1, 13.2, 13.3, 13.7_

- [ ] 21.2 (P) トレンド可視化とフィルター
  - 過去3サイクル分のスコアトレンド折れ線グラフ
  - 部署・期間・評価サイクルのフィルタリング
  - _Requirements: 13.5, 13.6_

- [ ] 21.3 (P) レポート非同期エクスポート
  - 共通 ExportJob 基盤で PDF/CSV 出力
  - _Requirements: 13.4_

- [ ] 22. 非機能要件・運用基盤の整備
- [ ] 22.1 レート制限とセキュリティヘッダー
  - 多段レート制限（全API 100/min・ログイン 10/min/IP・AI 20/min・検索 60/min・エクスポート 5/min）
  - HSTS・CSP・X-Frame-Options 等のセキュリティヘッダー
  - HTTPS 強制リダイレクト
  - _Requirements: 20.7, 20.8, 16.6_

- [ ] 22.2 (P) エラーロギングと監視
  - 構造化ログ出力・Sentry 連携
  - エラー発生率・AI 失敗率のダッシュボード
  - セキュリティイベント（認証失敗・権限エラー・レート制限）の閾値監視
  - _Requirements: 20.9, 20.19_

- [ ] 22.3 (P) バックアップと復旧訓練
  - PostgreSQL 日次自動バックアップ・7日保持
  - RTO 4時間・RPO 24時間の達成確認
  - 四半期 1 回の復旧訓練プロセス
  - _Requirements: 20.16, 20.17, 20.18_

- [ ] 22.4 アクセシビリティとレスポンシブ対応
  - WCAG 2.1 AA 準拠（コントラスト・キーボード操作・スクリーンリーダー）
  - モバイル・タブレット・デスクトップのレスポンシブ
  - ITリテラシー配慮のAI対話型UI
  - _Requirements: 20.10, 20.11, 20.12_

- [ ] 22.5 タイムゾーン・日本語ロケール固定（Phase 1）
  - 全体を Asia/Tokyo・ja-JP 固定
  - Phase 2 対応のための User.locale/timezone フィールドは予約済み
  - _Requirements: 20.14_

---

## Phase F: 統合検証

- [ ] 23. E2E 統合テストと性能検証
- [ ] 23.1 360度評価ライフサイクルの E2E テスト
  - 評価サイクル作成 → 自己/ピア評価 → AI対話 → 集計 → マイルド化 → HR承認 → 公開 → 閲覧
  - 評価者ID非露出の回帰検知
  - 最低評価者数未達時の公開保留検証
  - _Requirements: 8, 9, 10_

- [ ] 23.2 (P) 目標・異議申立て・インセンティブの E2E
  - 目標登録 → 承認 → 進捗更新 → 評価連携
  - 異議申立て → 審査 → 認容 → 再計算
  - インセンティブ加算と総合評価反映
  - _Requirements: 6, 11, 12, 18_

- [ ] 23.3 (P) 認証・アクセス制御の E2E
  - ロール別アクセス可否の網羅確認
  - セッション失効・パスワード世代チェック
  - 監査ログ・アクセスログの記録確認
  - 監査ログの改竄試行が DB で拒否されることの検証
  - _Requirements: 1, 17_

- [ ] 23.4 パフォーマンス・負荷テスト
  - API p95 < 500ms（同時500ユーザー負荷）
  - 社員検索 < 300ms
  - AI品質ゲート 3秒SLA
  - 一括通知 1000件 / 5分
  - _Requirements: 20.1, 20.2_

- [ ] 23.5\* (P) 回帰テストカバレッジの底上げ
  - ドメイン境界違反（他ドメイン Service 直接呼び出し）の静的解析
  - Zod output strict の網羅テスト
  - 暗号化カラムの復号失敗パターン
  - _Requirements: 20.4, 20.5_
