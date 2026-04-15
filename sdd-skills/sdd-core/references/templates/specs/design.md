# Technical Design Document

---
**Purpose**: 異なる実装者間での実装の一貫性を確保するために十分な詳細を提供する。

**Approach**:
- 実装判断に直接影響する必須セクションを含める
- クリティカルでないオプションセクションは省略
- 機能の複雑さに合わせた詳細レベル
- 冗長な散文よりも図表やテーブルを使用

**Warning**: 1000行に近づく場合は、設計の簡素化が必要な過度の複雑さを示す。
---

## Overview
2-3段落以内
**Purpose**: この機能は[特定の価値]を[対象ユーザー]に提供する。
**Users**: [対象ユーザーグループ]が[特定のワークフロー]のために利用する。
**Impact**（該当する場合）: 現在の[システム状態]を[特定の変更]によって変更する。

### Goals
- 主要目標1
- 主要目標2
- 成功基準

### Non-Goals
- 明示的に除外する機能
- 現在のスコープ外の将来的な考慮事項
- 延期する統合ポイント

## Architecture

### Existing Architecture Analysis（該当する場合）
既存システムを変更する場合:
- 現在のアーキテクチャパターンと制約
- 尊重すべき既存ドメイン境界
- 維持すべき統合ポイント
- 対処または回避する技術的負債

### Architecture Pattern & Boundary Map
**推奨**: 選択したアーキテクチャパターンとシステム境界を示すMermaid図

**Architecture Integration**:
- 選択パターン: [名前と簡潔な根拠]
- ドメイン/機能境界: [責務の分離方法]
- 既存パターン保持: [主要パターンのリスト]
- 新コンポーネントの根拠: [各コンポーネントが必要な理由]
- ステアリング準拠: [維持する原則]

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Frontend / CLI | | | |
| Backend / Services | | | |
| Data / Storage | | | |
| Messaging / Events | | | |
| Infrastructure / Runtime | | | |

## System Flows

非自明なフローを説明するために必要な図のみ提供。プレーンMermaid構文を使用。
- Sequence（複数パーティのインタラクション）
- Process / State（分岐ロジックやライフサイクル）
- Data / Event flow（パイプライン、非同期メッセージング）

シンプルなCRUD変更ではこのセクション全体を省略。

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1.1 | | | | |
| 1.2 | | | | |

## Components and Interfaces

### Component Summary

| Component | Domain/Layer | Intent | Req Coverage | Key Dependencies (Criticality) | Contracts |
|-----------|--------------|--------|--------------|--------------------------------|-----------|

### [Domain / Layer]

#### [Component Name]

| Field | Detail |
|-------|--------|
| Intent | 責務の1行説明 |
| Requirements | 2.1, 2.3 |

**Responsibilities & Constraints**
- 主要責任
- ドメイン境界とトランザクションスコープ
- データ所有権 / 不変条件

**Dependencies**
- Inbound: コンポーネント/サービス名 — 目的 (重要度)
- Outbound: コンポーネント/サービス名 — 目的 (重要度)
- External: サービス/ライブラリ — 目的 (重要度)

**Contracts**: Service [ ] / API [ ] / Event [ ] / Batch [ ] / State [ ]

##### Service Interface
```typescript
interface [ComponentName]Service {
  methodName(input: InputType): Result<OutputType, ErrorType>;
}
```
- Preconditions:
- Postconditions:
- Invariants:

**Implementation Notes**
- Integration:
- Validation:
- Risks:

## Data Models

### Domain Model
- 集約とトランザクション境界
- エンティティ、値オブジェクト、ドメインイベント
- ビジネスルール & 不変条件

### Logical Data Model
- エンティティ関係とカーディナリティ
- 属性と型
- 参照整合性ルール

### Physical Data Model
**含めるタイミング**: 実装で特定のストレージ設計決定が必要な場合

### Data Contracts & Integration
- リクエスト/レスポンススキーマ
- イベントスキーマ
- クロスサービスデータ管理

## Error Handling

### Error Strategy
各エラータイプの具体的なエラーハンドリングパターンと回復メカニズム。

### Error Categories and Responses
- **User Errors (4xx)**: 無効入力 → フィールドレベルバリデーション
- **System Errors (5xx)**: インフラ障害 → グレースフルデグラデーション
- **Business Logic Errors (422)**: ルール違反 → 条件説明

### Monitoring
エラートラッキング、ロギング、ヘルスモニタリングの実装。

## Testing Strategy

- Unit Tests: コア関数/モジュールから3-5項目
- Integration Tests: コンポーネント間フローから3-5項目
- E2E/UI Tests（該当する場合）: 重要ユーザーパスから3-5項目
- Performance/Load（該当する場合）: 3-4項目

## Optional Sections（関連する場合に含める）

### Security Considerations
### Performance & Scalability
### Migration Strategy

## Supporting References (Optional)
メインセクションに残すと可読性が低下する場合にのみ作成。
