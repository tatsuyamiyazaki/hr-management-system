---
name: sdd-tasks
description: SDDのタスク生成スキル。ユーザーが「タスク生成」「tasks」「実装計画」「タスクに分解」と言った場合に使用。承認済みの要件と設計に基づいて、チェックボックス形式の実装タスク一覧（tasks.md）を生成する。
---

# SDD Tasks — タスク生成

## 前提
本スキルの実行前に以下を読み込むこと:
- `../sdd-core/SKILL.md`（全体ルール）
- `../sdd-core/references/rules/tasks-generation.md`
- `../sdd-core/references/rules/tasks-parallel-analysis.md`
- `../sdd-core/references/templates/specs/tasks.md`

## 概要
承認済みの要件と設計に基づいて、実装可能なタスク一覧を生成する。

## 前提条件
- `requirements` と `design` が承認済み
- `-y` フラグ指定時: 設計が生成済みであれば自動承認して続行

## 入力
- **feature名**: 対象の仕様ディレクトリ名
- **-y フラグ**（オプション）: 設計の自動承認
- **--sequential**（オプション）: 並列マーカーを省略

## 実行プロセス

### Step 1: コンテキスト収集
1. `.kiro/specs/{feature}/requirements.md` を読み込む
2. `.kiro/specs/{feature}/design.md` を読み込む
3. `.kiro/specs/{feature}/research.md` を読み込む（存在する場合）
4. `.kiro/steering/` 全ファイルを読み込む

### Step 2: タスク分解
design.md のコンポーネントとフローに基づき、機能中心のタスクに分解:

**タスク生成ルール**:
- 自然言語で記述（ファイルパス、関数名は避ける）
- 最大2レベル階層（メジャー + サブタスク）
- メジャータスクは連番（1, 2, 3...）
- サブタスクはメジャーごとにリセット（1.1, 1.2, 2.1...）
- 各サブタスクは1-3時間、3-10の詳細項目

**タスク構成の原則**:
- コア機能を早期に検証
- 前のタスクの出力に基づいて構築
- 統合タスクで全体を接続
- コード関連のみ（デプロイ、ドキュメントは除外）

### Step 3: 並列分析（デフォルト有効）
`--sequential` でない限り、各タスクの並列実行可能性を評価:
1. データ依存なし
2. 共有リソースの競合なし
3. 前提レビュー/承認不要
4. 環境/セットアップ充足

全条件を満たすタスクに `(P)` マーカーを付与。

### Step 4: 要件マッピング
各タスクの詳細セクション末尾に `_Requirements: X.X, Y.Y_` を記載。
全要件がカバーされていることをクロスチェック。

### Step 5: tasks.md 生成
チェックボックス形式で生成:
```markdown
- [ ] 1. メジャータスク
- [ ] 1.1 (P) サブタスク
  - 詳細項目
  - _Requirements: 1.1, 1.2_
```

### Step 6: spec.json 更新
```json
{
  "phase": "tasks-generated",
  "approvals": {
    "tasks": { "generated": true, "approved": false }
  }
}
```

### Step 7: ユーザーレビュー依頼
- タスクの粒度と順序
- 並列マーカーの妥当性
- 要件カバレッジの完全性

## ユーザー承認時
```json
{
  "approvals": {
    "tasks": { "generated": true, "approved": true }
  },
  "ready_for_implementation": true
}
```

## 品質チェックリスト
- [ ] 全要件がタスクにマッピングされているか
- [ ] タスクは自然言語で記述されているか（コード構造ではなく機能記述）
- [ ] 連番が正しいか（メジャータスク番号の重複なし）
- [ ] 並列マーカーが4条件を全て満たすか
- [ ] 統合タスクが含まれているか
- [ ] 各サブタスクが1-3時間の粒度か
