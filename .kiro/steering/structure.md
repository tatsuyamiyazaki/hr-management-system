# プロジェクト構造

## 構成哲学

**フィーチャーファースト + レイヤード**の組み合わせ。
ドメインごとにディレクトリを切り、各ドメイン内で UI・サービス・リポジトリを分離する。
ドメインはHRの業務領域に一対一対応し、要件書（20要件）と整合するよう配置する。

## ドメイン一覧

| ドメイン | 対応要件 | 責務 |
|---------|---------|------|
| `auth` | Req 1 | 認証・認可・ロール判定・セッション管理・2FA/SSO |
| `master` | Req 2 | スキル・役職・等級マスタ管理 |
| `organization` | Req 3 | 組織図・異動履歴 |
| `skill` | Req 4 | スキルマップ・ヒートマップ・ギャップ分析 |
| `career` | Req 5 | キャリアマップ・希望役職 |
| `goal` | Req 6 | OKR/MBO・多階層目標ツリー・上長承認フロー |
| `one-on-one` | Req 7 | 1on1ログタイムライン・予定管理 |
| `evaluation` | Req 8 | 360度評価サイクル・評価対象選択・自己評価・最低評価者数管理 |
| `ai-coach` | Req 9 | 対話型品質ゲート |
| `feedback` | Req 10 | マイルド化変換・匿名閲覧・アーカイブ |
| `incentive` | Req 11 | 評価者インセンティブ計算 |
| `total-evaluation` | Req 12 | 業績・目標・360度の加重平均 |
| `dashboard` | Req 13 | KPI・レポート出力 |
| `lifecycle` | Req 14 | 入社・休職・退職・社員一括インポート・プロフィール |
| `notification` | Req 15（横断） | メール・アプリ内通知の統一・ユーザー通知設定 |
| `search` | Req 16（横断） | 社員検索（氏名・部署・役職） |
| `audit-log` | Req 17（横断） | 全権限操作の記録・閲覧・エクスポート |
| `appeal` | Req 18 | 評価への異議申立て・審査フロー |
| `ai-monitoring` | Req 19 | AIコスト・使用量・異常利用検知 |

## レイヤー構造

| レイヤー | 責務 | 典型ファイル |
|---------|------|------------|
| Presentation | UI・RSC・API Routes | `app/(dashboard)/**`, `app/api/**/route.ts` |
| Service | ビジネスロジック | `lib/{domain}/service.ts` |
| Repository | DB・外部サービス抽象化 | `lib/{domain}/repository.ts` |
| Job | 非同期処理（BullMQ） | `lib/jobs/*.ts` |
| Shared | 横断的ユーティリティ | `lib/shared/**` |

## ディレクトリパターン

### アプリケーションルート
**Location**: `app/`（Next.js App Router）
**Purpose**: ページ・レイアウト・API Routes
**Example**: `app/(dashboard)/organization/page.tsx`, `app/api/evaluations/route.ts`

### ドメインロジック
**Location**: `lib/{domain}/`
**Purpose**: ビジネスロジック・サービス層・AI連携ロジック
**Example**: `lib/evaluation/service.ts`, `lib/ai-coach/quality-gate.ts`

### データアクセス
**Location**: `lib/{domain}/repository.ts`（Prismaを内包）
**Purpose**: DB操作をリポジトリパターンで抽象化
**Example**: `lib/evaluation/repository.ts` — findById, create, update

### UIコンポーネント
**Location**: `components/ui/`（汎用）、`components/{domain}/`（ドメイン固有）
**Purpose**: 再利用可能なプリミティブ / ドメイン固有の表示コンポーネント
**Example**: `components/evaluation/EvaluationForm.tsx`, `components/ui/Button.tsx`

### ジョブ・ワーカー
**Location**: `lib/jobs/`
**Purpose**: AI処理・一括通知・集計・CSVインポートなどの非同期ジョブ（BullMQ）
**Example**: `lib/jobs/ai-feedback-transform.ts`, `lib/jobs/total-eval-calc.ts`, `lib/jobs/bulk-notification.ts`

### Prismaスキーマ
**Location**: `prisma/schema.prisma`
**Purpose**: データモデル定義・マイグレーション管理

### 型定義
**Location**: `types/`
**Purpose**: 共有型（APIレスポンス・ドメインモデル）
**Example**: `types/evaluation.ts`, `types/api.ts`

## 命名規約

- **ファイル（コンポーネント）**: PascalCase（例: `EvaluationForm.tsx`）
- **ファイル（ロジック/ユーティリティ）**: kebab-case（例: `ai-coach.ts`, `use-evaluation.ts`）
- **ディレクトリ**: kebab-case（例: `evaluation/`, `one-on-one/`, `total-evaluation/`）
- **カスタムフック**: `use` プレフィックス + camelCase（例: `useEvaluation`）
- **型/インターフェース**: PascalCase（例: `EvaluationCycle`, `UserRole`）
- **DB テーブル**: snake_case（Prisma規約）

## Import 整理

```typescript
// 1. 外部ライブラリ
import { useState } from 'react'
import { z } from 'zod'

// 2. 内部モジュール（絶対パス）
import { EvaluationService } from '@/lib/evaluation/service'
import { Button } from '@/components/ui/Button'

// 3. 同一ドメイン内（相対パス）
import { evaluationSchema } from './schema'
```

**パスエイリアス**:
- `@/`: `src/`（またはプロジェクトルート）

## コード組織の原則

- **単方向依存**: `app/` → `lib/{domain}/service.ts` → `lib/{domain}/repository.ts` → `prisma/`（逆方向禁止）
- **ドメイン境界**: ドメイン間の直接参照を避け、`lib/shared/` 経由で共有
- **横断ドメイン**: `notification`・`audit-log`・`search`・`ai-coach`・`feedback` は他ドメインから呼び出される Publisher/Subscriber モデル
- **非同期処理の集約**: AI処理・一括通知・集計・CSVインポートは必ず `lib/jobs/` に集約
- **Server/Client 分離**: `use client` は UI インタラクションのみに限定、データ取得はサーバーコンポーネント
- **APIレスポンス統一**: `{ success: boolean, data: T | null, error: ErrorObject | null, meta: MetaObject }` 形式（詳細は `api-standards.md`）
- **RBAC**: ロール（ADMIN / HR_MANAGER / MANAGER / EMPLOYEE）をmiddlewareで検証（詳細は `security.md`）
- **AI呼び出しの集約**: AI API は `lib/ai-coach/` と `lib/feedback/` のみから呼び出し、利用は `lib/ai-monitoring/` が記録（他ドメインは禁止）
- **監査ログの横断発行**: 権限操作・重要状態遷移は `lib/audit-log/emit.ts` 経由で非同期記録

---
_created: 2026-04-15 | updated: 2026-04-15（要件書同期：ドメイン14→19、レイヤー構造明示、横断ドメイン拡張） | パターンを記述。ファイルツリーではない_
