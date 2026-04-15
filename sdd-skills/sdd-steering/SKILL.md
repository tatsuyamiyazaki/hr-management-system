---
name: sdd-steering
description: SDDのステアリング（プロジェクトメモリ）管理スキル。ユーザーが「ステアリング」「プロジェクトメモリ」「steering」「プロジェクトの設定」「プロジェクト概要を作りたい」と言った場合に使用。プロダクト・技術スタック・構造のステアリングファイルの生成・同期・カスタムステアリングの作成を行う。
---

# SDD Steering — プロジェクトメモリ管理

## 前提
本スキルの実行前に以下を読み込むこと:
- `../sdd-core/SKILL.md`（全体ルール）
- `../sdd-core/references/rules/steering-principles.md`

## 概要
ステアリングはプロジェクト全体に適用される「プロジェクトメモリ」を管理する。
全仕様（`.kiro/specs/`）で共有されるコンテキスト・標準・アーキテクチャ方針を `.kiro/steering/` に格納する。

## 3つの動作モード

### 1. Bootstrap（初期生成）
**トリガー**: `.kiro/steering/` が存在しない、またはユーザーが「ステアリングを初期化」と指示
**動作**:
1. プロジェクトルートを分析（README, package.json, pyproject.toml, 主要ソースコード等）
2. 以下を生成:
   - `.kiro/steering/product.md` — プロダクト概要
   - `.kiro/steering/tech.md` — 技術スタック・規約
   - `.kiro/steering/structure.md` — プロジェクト構造・命名
3. ユーザーにレビューを依頼

**テンプレート参照**:
- `../sdd-core/references/templates/steering/product.md`
- `../sdd-core/references/templates/steering/tech.md`
- `../sdd-core/references/templates/steering/structure.md`

### 2. Sync（同期・更新）
**トリガー**: ユーザーが「ステアリングを更新」「同期」と指示、または大きなアーキテクチャ変更後
**動作**:
1. 現在のステアリングファイルを読み込む
2. コードベースの現状と比較
3. 差分を検出し、更新を提案
4. ユーザー確認後に更新（追加型: 既存セクションを保持しつつ追加/修正）
5. `updated_at` タイムスタンプを追加

**原則**:
- ユーザーが追加したカスタムセクションは保持
- 変更理由を明記
- 破壊的変更は必ずユーザー確認

### 3. Custom（カスタムステアリング作成）
**トリガー**: ユーザーが「APIルール」「テスト標準」「セキュリティ方針」等の専門パターンを定義したい場合
**動作**:
1. 目的を確認（API? テスト? セキュリティ? DB? エラーハンドリング? 認証? デプロイ?）
2. 対応するテンプレートを提案
3. プロジェクトの現状から情報を抽出して埋め込み
4. `.kiro/steering/{custom-name}.md` として保存

**テンプレート参照**:
- `../sdd-core/references/templates/steering-custom/api-standards.md`
- `../sdd-core/references/templates/steering-custom/testing.md`
- `../sdd-core/references/templates/steering-custom/security.md`
- `../sdd-core/references/templates/steering-custom/database.md`
- `../sdd-core/references/templates/steering-custom/error-handling.md`
- `../sdd-core/references/templates/steering-custom/authentication.md`
- `../sdd-core/references/templates/steering-custom/deployment.md`

テンプレートにない専門パターンもユーザーの要望に応じて自由に作成可能。

## 品質チェックリスト
- [ ] 実装詳細ではなくパターンを記述しているか
- [ ] セキュリティ情報（APIキー、パスワード等）が含まれていないか
- [ ] 各ファイルが単一ドメインに集中しているか
- [ ] 100-200行程度に収まっているか
- [ ] 具体例が含まれているか
- [ ] 根拠が説明されているか
