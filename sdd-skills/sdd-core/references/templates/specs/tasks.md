# Implementation Plan

## Task Format Template

作業分解に合わせていずれかのパターンを使用:

### メジャータスクのみ
- [ ] {{NUMBER}}. {{TASK_DESCRIPTION}}{{PARALLEL_MARK}}
  - {{DETAIL_ITEM_1}} *(詳細が必要な場合のみ含める。タスクが自立する場合は箇条書き省略。)*
  - _Requirements: {{REQUIREMENT_IDS}}_

### メジャー + サブタスク構造
- [ ] {{MAJOR_NUMBER}}. {{MAJOR_TASK_SUMMARY}}
- [ ] {{MAJOR_NUMBER}}.{{SUB_NUMBER}} {{SUB_TASK_DESCRIPTION}}{{SUB_PARALLEL_MARK}}
  - {{DETAIL_ITEM_1}}
  - {{DETAIL_ITEM_2}}
  - _Requirements: {{REQUIREMENT_IDS}}_ *(IDのみ。説明や括弧は付けない。)*

> **並列マーカー**: 並列実行可能なタスクにのみ ` (P)` を付与。`--sequential` モード時はマーカーを省略。
>
> **オプションテストカバレッジ**: サブタスクが受け入れ基準に紐づく延期可能なテスト作業の場合、チェックボックスを `- [ ]*` としてマーク。
