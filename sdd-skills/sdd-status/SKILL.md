---
name: sdd-status
description: SDDの進捗確認スキル。ユーザーが「進捗」「status」「今どこ？」「仕様の状態」と言った場合に使用。指定された機能の仕様進捗をspec.jsonとtasks.mdから読み取り、視覚的に表示する。
---

# SDD Status — 進捗確認

## 前提
本スキルの実行前に以下を読み込むこと:
- `../sdd-core/SKILL.md`（全体ルール）

## 概要
仕様の現在の進捗状態を視覚的に表示する。

## 入力
- **feature名**: 対象の仕様ディレクトリ名
- feature名なし: `.kiro/specs/` 配下の全仕様を一覧表示

## 実行プロセス

### 単一仕様の場合

#### Step 1: spec.json 読み込み
phase, approvals, ready_for_implementation を取得

#### Step 2: tasks.md 解析（存在する場合）
- 総タスク数（チェックボックス `- [ ]` と `- [x]` の合計）
- 完了タスク数（`- [x]` の数）
- 並列タスク数（`(P)` マーカーの数）
- 完了率の計算

#### Step 3: 進捗表示

```
╔══════════════════════════════════════╗
║  📋 {feature_name}                  ║
╠══════════════════════════════════════╣
║  Phase: {phase}                      ║
║                                      ║
║  ✅ Requirements  generated/approved ║
║  ✅ Design        generated/approved ║
║  ⬜ Tasks         not generated      ║
║                                      ║
║  Implementation: Not started         ║
║  ████░░░░░░ 40% (4/10 tasks)        ║
║  Parallel tasks available: 3         ║
╚══════════════════════════════════════╝
```

各フェーズのアイコン:
- ⬜ 未生成
- 🔄 生成済み・未承認
- ✅ 承認済み

### 全仕様一覧の場合

#### Step 1: `.kiro/specs/` を走査
全ディレクトリのspec.jsonを読み込む

#### Step 2: サマリーテーブル表示

```
| Feature | Phase | Req | Design | Tasks | Progress |
|---------|-------|-----|--------|-------|----------|
| auth    | impl  | ✅  | ✅     | ✅    | 70%     |
| search  | design| ✅  | 🔄     | ⬜    | -       |
| notify  | init  | ⬜  | ⬜     | ⬜    | -       |
```

## 次のアクション提案
現在のフェーズに応じて次のアクションを提案:
- `initialized` → 「`sdd-requirements` で要件を生成しましょう」
- `requirements-generated`（未承認）→ 「要件をレビューして承認してください」
- `requirements-generated`（承認済み）→ 「`sdd-design` で技術設計を行いましょう」
- `design-generated`（未承認）→ 「設計をレビューして承認してください」
- `design-generated`（承認済み）→ 「`sdd-tasks` でタスクを生成しましょう」
- `tasks-generated`（未承認）→ 「タスクをレビューして承認してください」
- `tasks-generated`（承認済み）→ 「`sdd-impl` で実装を開始しましょう」
- 実装中 → 「次の未完了タスク: {task_id} {task_description}」

## エラーケース
- `.kiro/specs/` が存在しない → 「仕様が見つかりません。`sdd-init` で初期化してください」
- 指定されたfeatureが存在しない → 利用可能なfeature一覧を表示
