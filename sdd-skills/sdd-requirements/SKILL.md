---
name: sdd-requirements
description: SDDの要件生成スキル。ユーザーが「要件を作成」「requirements」「受け入れ基準」「EARS」「仕様の要件を書いて」と言った場合に使用。EARS形式の要件と受け入れ基準を生成し、requirements.mdに書き込む。
---

# SDD Requirements — 要件生成

## 前提
本スキルの実行前に以下を読み込むこと:
- `../sdd-core/SKILL.md`（全体ルール）
- `../sdd-core/references/rules/ears-format.md`
- `../sdd-core/references/templates/specs/requirements.md`

## 概要
初期化済みの仕様に対して、EARS形式の要件と受け入れ基準を生成する。

## 前提条件
- `spec.json` が存在し、`phase` が `"initialized"` であること
- `requirements.md` が存在し、Project Description が記載されていること

## 入力
- **feature名**: 対象の仕様ディレクトリ名
- ステアリング情報（`.kiro/steering/` 存在時に自動読み込み）

## 実行プロセス

### Step 1: コンテキスト収集
1. `.kiro/specs/{feature}/requirements.md` の Project Description を読み込む
2. `.kiro/steering/` が存在すれば全ステアリングファイルを読み込む
3. 関連するコードベースの構造を分析（既存プロジェクトの場合）

### Step 2: 要件の構造化
1. Project Description から主要ドメインを抽出
2. 各ドメインに要件グループを定義
3. 各要件にEARS形式の受け入れ基準を作成

**要件構造ルール**:
- トップレベル要件は `### Requirement N: タイトル` 形式
- 各要件に `**Objective:**` を User Story 形式で記載
- 受け入れ基準は EARS パターンを使用（When/If/While/Where/shall）
- 要件IDは数値のみ（`N.M` 形式）、アルファベットID禁止

### Step 3: requirements.md への書き込み
テンプレートに従い、以下を生成:
- Introduction（1-2段落の機能概要）
- Requirements セクション（全要件と受け入れ基準）

### Step 4: spec.json 更新
```json
{
  "phase": "requirements-generated",
  "approvals": {
    "requirements": { "generated": true, "approved": false }
  }
}
```

### Step 5: ユーザーレビュー依頼
生成した要件をユーザーに提示し、レビューを依頼:
- 要件の過不足
- 受け入れ基準の正確性
- 優先順位の調整

## ユーザー承認時
ユーザーが要件を承認したら:
```json
{
  "approvals": {
    "requirements": { "generated": true, "approved": true }
  }
}
```

## EARS形式の適用ルール
- EARSキーワード（When, If, While, Where, shall）は英語
- 条件と応答の内容は日本語
- 1つの受け入れ基準 = 1つの動作（複合動作は分割）
- テスト可能・検証可能な表現のみ

## 品質チェックリスト
- [ ] 全要件にEARS形式の受け入れ基準があるか
- [ ] 要件IDは数値のみ（N.M形式）か
- [ ] 曖昧な表現（「適切に」「正しく」等）がないか
- [ ] 機能要件と非機能要件の両方がカバーされているか
- [ ] Project Description の全側面が要件に反映されているか
