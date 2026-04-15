---
name: sdd-core
description: SDD（Spec-Driven Development / 仕様駆動開発）の共通基盤スキル。ユーザーが「SDD」「仕様駆動開発」「spec-driven」「AI-DLC」「仕様を作りたい」「開発ワークフロー」と言った場合に使用。SDDワークフロー全体の概要、パス規約、フェーズ管理、承認ゲートのルールを提供し、各フェーズ別スキル（sdd-init, sdd-requirements, sdd-design, sdd-tasks, sdd-impl, sdd-validate, sdd-status, sdd-steering）への案内を行う。
---

# SDD Core - 仕様駆動開発の共通基盤

AI-DLC（AI Driven Development Lifecycle）に基づくSpec-Driven Development（仕様駆動開発）の共通基盤。
cc-sdd / Kiro IDE のワークフローをClaude Codeスキルとして再実装したもの。

## 言語設定

- Think in English, generate responses in Japanese
- すべての仕様書（requirements.md, design.md, tasks.md, research.md 等）は日本語で記述
- spec.json の language フィールドは `"ja"` をデフォルトとする（将来的な多言語対応の余地あり）

## SDDワークフロー全体像

```
Phase 0（任意）: ステアリング（プロジェクトメモリ構築）
  └─ sdd-steering スキル

Phase 1: 仕様策定
  ├─ 1a. 初期化        → sdd-init スキル
  ├─ 1b. 要件生成      → sdd-requirements スキル
  ├─ 1c. ギャップ分析   → sdd-validate スキル（任意・既存プロジェクト向け）
  ├─ 1d. 技術設計      → sdd-design スキル
  ├─ 1e. 設計レビュー   → sdd-validate スキル（任意）
  └─ 1f. タスク生成     → sdd-tasks スキル

Phase 2: 実装
  ├─ TDD実装           → sdd-impl スキル
  └─ 実装検証           → sdd-validate スキル（任意）

随時: 進捗確認          → sdd-status スキル
```

## パス規約

| パス | 用途 |
|------|------|
| `.kiro/specs/{feature}/` | 機能別仕様ディレクトリ |
| `.kiro/specs/{feature}/spec.json` | メタデータ・フェーズ状態 |
| `.kiro/specs/{feature}/requirements.md` | 要件定義書 |
| `.kiro/specs/{feature}/design.md` | 技術設計書 |
| `.kiro/specs/{feature}/research.md` | 調査・ディスカバリー記録 |
| `.kiro/specs/{feature}/tasks.md` | 実装タスク一覧 |
| `.kiro/steering/` | プロジェクトメモリ（全仕様共通） |
| `.kiro/steering/product.md` | プロダクト概要 |
| `.kiro/steering/tech.md` | 技術スタック・規約 |
| `.kiro/steering/structure.md` | プロジェクト構造・命名規約 |
| `.kiro/steering/{custom}.md` | カスタムステアリング |

## フェーズ管理（spec.json）

spec.json は各仕様の状態を管理する。フェーズは以下の順序で遷移する:

```
initialized → requirements-generated → design-generated → tasks-generated → (実装中)
```

### spec.json スキーマ

```json
{
  "feature_name": "{feature}",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601",
  "language": "ja",
  "phase": "initialized | requirements-generated | design-generated | tasks-generated",
  "approvals": {
    "requirements": { "generated": false, "approved": false },
    "design": { "generated": false, "approved": false },
    "tasks": { "generated": false, "approved": false }
  },
  "ready_for_implementation": false
}
```

## 承認ゲート

各フェーズは前フェーズの承認を必要とする:

| フェーズ | 前提条件 | 自動承認 |
|---------|---------|---------|
| 要件生成 | spec初期化済み | - |
| 設計生成 | 要件が承認済み | `-y` フラグで自動承認 |
| タスク生成 | 要件・設計が承認済み | `-y` フラグで自動承認 |
| 実装 | タスクが承認済み | - |

**原則**: 人間が各フェーズでレビュー・承認する。`-y` は意図的なファストトラック時のみ使用。

## 要件ID規約

- 要件IDは数値のみ使用（例: `1.1`, `1.2`, `2.1`, `3.3`）
- アルファベットID（例: `Requirement A`）は使用禁止
- `N.M` 形式: `N` = requirements.md のトップレベル要件番号、`M` = その中のローカルインデックス
- タスクや設計書での参照時もこのIDをそのまま使う

## ルール・テンプレート参照先

各フェーズスキルは、以下のファイルを参照する:

### ルール（rules/）
- `ears-format.md` — EARS要件形式ガイドライン
- `design-principles.md` — 技術設計の原則
- `design-discovery-full.md` — フルディスカバリープロセス
- `design-discovery-light.md` — ライトディスカバリープロセス
- `design-review.md` — 設計レビュープロセス
- `gap-analysis.md` — ギャップ分析フレームワーク
- `steering-principles.md` — ステアリング原則
- `tasks-generation.md` — タスク生成ルール
- `tasks-parallel-analysis.md` — 並列タスク分析ルール

### テンプレート（templates/）
- `specs/init.json` — spec.json 初期テンプレート
- `specs/requirements-init.md` — requirements.md 初期テンプレート
- `specs/requirements.md` — 要件書テンプレート
- `specs/design.md` — 設計書テンプレート
- `specs/research.md` — 調査記録テンプレート
- `specs/tasks.md` — タスク一覧テンプレート
- `steering/product.md` — プロダクトステアリングテンプレート
- `steering/tech.md` — 技術ステアリングテンプレート
- `steering/structure.md` — 構造ステアリングテンプレート
- `steering-custom/*.md` — カスタムステアリングテンプレート7種

**参照方法**: 各スキルのSKILL.md内で以下のように参照する:
```
本スキルの実行前に以下を読み込むこと:
- ./references/rules/{file}.md
- ./references/templates/{path}/{file}
```

## コマンドマッピング（Claude Code CLI用）

| コマンド | スキル | 説明 |
|---------|-------|------|
| `/sdd:init <説明>` | sdd-init | 仕様初期化 |
| `/sdd:requirements <feature>` | sdd-requirements | 要件生成 |
| `/sdd:design <feature> [-y]` | sdd-design | 技術設計 |
| `/sdd:tasks <feature> [-y]` | sdd-tasks | タスク生成 |
| `/sdd:impl <feature> [tasks]` | sdd-impl | TDD実装 |
| `/sdd:validate-gap <feature>` | sdd-validate | ギャップ分析 |
| `/sdd:validate-design <feature>` | sdd-validate | 設計レビュー |
| `/sdd:validate-impl [feature]` | sdd-validate | 実装検証 |
| `/sdd:status <feature>` | sdd-status | 進捗確認 |
| `/sdd:steering` | sdd-steering | ステアリング管理 |
| `/sdd:steering-custom` | sdd-steering | カスタムステアリング |

## ステアリング vs 仕様

- **ステアリング** (`.kiro/steering/`) — プロジェクト全体に適用されるルール・コンテキスト・アーキテクチャ方針。全仕様で共有される「プロジェクトメモリ」
- **仕様** (`.kiro/specs/`) — 個別機能の開発プロセスを形式化したもの。要件→設計→タスク→実装の段階的ワークフロー

## 開発ルール

1. 3フェーズ承認ワークフロー: 要件 → 設計 → タスク → 実装
2. 各フェーズで人間レビュー必須。`-y` は意図的なファストトラック時のみ
3. ステアリングを最新に保ち、仕様との整合性を維持
4. ユーザーの指示に正確に従い、その範囲内で自律的に行動: 必要なコンテキストを収集し、今回の実行で要求された作業をエンドツーエンドで完了する。質問は、必須情報が不足している場合や指示が致命的に曖昧な場合のみ
