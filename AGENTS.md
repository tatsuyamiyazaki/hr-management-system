# AGENTS.md — SDD（仕様駆動開発）ワークフロー

このプロジェクトはSDD（Spec-Driven Development / 仕様駆動開発）ワークフローを使用しています。

## SDDとは

AI-DLC（AI Driven Development Lifecycle）に基づく仕様駆動の開発フレームワーク。
要件→設計→タスク→実装の段階的ワークフローで、各フェーズに人間の承認ゲートを設置。

## ワークフロー

```
ステアリング初期化 → 仕様初期化 → 要件生成 → 技術設計 → タスク生成 → TDD実装
     (任意)          (必須)       (必須)      (必須)      (必須)     (必須)
```

## コマンド

| コマンド                         | 説明                             |
| -------------------------------- | -------------------------------- |
| `/sdd:steering`                  | プロジェクトメモリの初期化・更新 |
| `/sdd:steering-custom`           | カスタムステアリングの作成       |
| `/sdd:init <説明>`               | 新機能の仕様を初期化             |
| `/sdd:requirements <feature>`    | EARS形式の要件を生成             |
| `/sdd:design <feature> [-y]`     | 技術設計書を生成                 |
| `/sdd:tasks <feature> [-y]`      | 実装タスクを生成                 |
| `/sdd:impl <feature> [tasks]`    | TDD方式で実装                    |
| `/sdd:validate-gap <feature>`    | ギャップ分析を実施               |
| `/sdd:validate-design <feature>` | 設計レビューを実施               |
| `/sdd:validate-impl [feature]`   | 実装検証を実施                   |
| `/sdd:status [feature]`          | 進捗を確認                       |

## ディレクトリ構造

```
.kiro/
├── steering/          # プロジェクトメモリ（全仕様共通）
│   ├── product.md     # プロダクト概要
│   ├── tech.md        # 技術スタック・規約
│   ├── structure.md   # プロジェクト構造・命名
│   └── {custom}.md    # カスタムステアリング
└── specs/             # 機能別仕様
    └── {feature}/
        ├── spec.json       # メタデータ・フェーズ状態
        ├── requirements.md # EARS形式の要件定義
        ├── design.md       # 技術設計書
        ├── research.md     # 調査記録
        └── tasks.md        # 実装タスク一覧
```

## SDDスキルの配置

SDDスキルは以下のいずれかに配置して使用する:

### Codex CLI（Windows / macOS / Linux）

```
{project-root}/
├── .Codex/
│   └── commands/         # スラッシュコマンド（generate-sdd-commands で生成）
└── sdd-skills/           # SDDスキル本体
    ├── sdd-core/
    │   ├── SKILL.md
    │   └── references/
    ├── sdd-steering/
    ├── sdd-init/
    ├── sdd-requirements/
    ├── sdd-design/
    ├── sdd-tasks/
    ├── sdd-impl/
    ├── sdd-validate/
    └── sdd-status/
```

スラッシュコマンド生成:

- **Windows (PowerShell)**: `.\generate-sdd-commands.ps1 -SkillsDir .\sdd-skills`
- **macOS/Linux (Bash)**: `./generate-sdd-commands.sh ./sdd-skills`

### Codex.ai（チャット環境）

`/mnt/skills/user/` に各スキルフォルダを配置（Anthropicのスキルシステムが自動管理）

## ルール

1. **承認ゲート**: 要件→設計→タスクの各フェーズで人間のレビュー・承認が必要
2. **EARS形式**: 受け入れ基準は When/If/While/Where/shall パターンで記述
3. **要件IDは数値のみ**: `N.M` 形式（例: 1.1, 2.3）。アルファベットID禁止
4. **型安全**: TypeScriptでは `any` 禁止
5. **WHATに集中**: 設計書はインターフェースとコントラクトを定義、コードは書かない
6. **日本語**: 全仕様書は日本語で記述（EARSキーワードのみ英語）
