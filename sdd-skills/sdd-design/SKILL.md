---
name: sdd-design
description: SDDの技術設計スキル。ユーザーが「技術設計」「design」「アーキテクチャ設計」「設計書を作って」と言った場合に使用。承認済み要件に基づいてディスカバリー（技術調査）を実施し、技術設計書（design.md）と調査記録（research.md）を生成する。
---

# SDD Design — 技術設計

## 前提
本スキルの実行前に以下を読み込むこと:
- `../sdd-core/SKILL.md`（全体ルール）
- `../sdd-core/references/rules/design-principles.md`
- `../sdd-core/references/rules/design-discovery-full.md`
- `../sdd-core/references/rules/design-discovery-light.md`
- `../sdd-core/references/templates/specs/design.md`
- `../sdd-core/references/templates/specs/research.md`

## 概要
承認済みの要件に基づき、技術調査（ディスカバリー）を実施した上で技術設計書を生成する。

## 前提条件
- `requirements` が承認済み（`approvals.requirements.approved == true`）
- `-y` フラグ指定時: 要件が生成済みであれば自動承認して続行

## 入力
- **feature名**: 対象の仕様ディレクトリ名
- **-y フラグ**（オプション）: 要件の自動承認

## 実行プロセス

### Step 1: コンテキスト収集
1. `.kiro/specs/{feature}/requirements.md` を読み込む
2. `.kiro/steering/` 全ファイルを読み込む
3. 既存コードベースの構造を分析

### Step 2: ディスカバリースコープ判定
**フルディスカバリー**（以下のいずれかに該当）:
- 新規プロジェクト or 新規大機能
- 複雑な外部統合あり
- セキュリティクリティカル
- アーキテクチャ変更を伴う

**ライトディスカバリー**（以下の全てに該当）:
- 既存プロジェクトの拡張
- 既存パターンに沿う
- セキュリティインパクト小
- 外部統合が単純 or なし

### Step 3: ディスカバリー実施
選択したスコープに応じてディスカバリーを実行:
- フル: `design-discovery-full.md` の6ステップを順に実施
- ライト: `design-discovery-light.md` の4ステップを実施（エスカレーション条件に注意）

**調査結果を `research.md` に記録**

### Step 4: design.md 生成
テンプレートに従い、ディスカバリーの成果を反映:
- **必須セクション**: Overview, Architecture, Components and Interfaces, Data Models, Error Handling, Testing Strategy
- **条件付きセクション**: System Flows（非自明な場合）, Requirements Traceability（複雑な場合）, Security, Performance, Migration
- **省略判断**: 単純CRUD → System Flows省略、セキュリティ無関係 → Security省略

**重要ルール**:
- WHATに集中、HOWは書かない
- 型安全必須（TypeScriptでは `any` 禁止）
- Mermaidはプレーンのみ（スタイリングなし）
- 1000行超は過度の複雑さの警告サイン

### Step 5: spec.json 更新
```json
{
  "phase": "design-generated",
  "approvals": {
    "design": { "generated": true, "approved": false }
  }
}
```

### Step 6: ユーザーレビュー依頼
生成した設計をユーザーに提示:
- アーキテクチャ判断の妥当性
- コンポーネント境界の適切さ
- 要件カバレッジの完全性

## ユーザー承認時
```json
{
  "approvals": {
    "design": { "generated": true, "approved": true }
  }
}
```

## 出力
```
.kiro/specs/{feature}/
├── spec.json      （phase: "design-generated"）
├── requirements.md（変更なし）
├── design.md      （技術設計書）
└── research.md    （調査記録）
```

## 品質チェックリスト
- [ ] 全要件が対処済みか
- [ ] 実装詳細（コード）が漏れていないか
- [ ] コンポーネント境界が明確か
- [ ] エラーハンドリングが包括的か
- [ ] テスト戦略が定義されているか
- [ ] セキュリティが考慮されているか
- [ ] research.md に判断根拠が記録されているか
