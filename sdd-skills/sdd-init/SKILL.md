---
name: sdd-init
description: SDDの仕様初期化スキル。ユーザーが「仕様を作りたい」「新機能の仕様」「spec-init」「機能を定義」と言った場合に使用。指定された機能のディレクトリ構造とメタデータを初期化し、要件生成フェーズへの準備を行う。
---

# SDD Init — 仕様初期化

## 前提
本スキルの実行前に以下を読み込むこと:
- `../sdd-core/SKILL.md`（全体ルール）

## 概要
新機能の仕様開発を開始するための初期化を行う。
ディレクトリ構造の作成、メタデータの生成、初期requirements.mdの配置を行う。

## 入力
ユーザーから以下を取得:
- **機能名**（feature name）: ディレクトリ名に使用（kebab-case推奨）
- **説明**（description）: 機能の概要（requirements.mdのProject Descriptionに記載）

## 実行プロセス

### Step 1: ステアリング存在チェック
`.kiro/steering/` の存在を確認。存在しない場合:
- ユーザーに通知: 「ステアリングが未設定です。先に `sdd-steering` で初期化することを推奨しますが、省略も可能です」
- ユーザーの選択に従う

### Step 2: ディレクトリ作成
```
.kiro/specs/{feature}/
```

### Step 3: spec.json 生成
テンプレート参照: `../sdd-core/references/templates/specs/init.json`

プレースホルダーを置換:
- `{{FEATURE_NAME}}` → ユーザー指定の機能名
- `{{TIMESTAMP}}` → 現在のISO 8601タイムスタンプ

### Step 4: requirements.md 初期生成
テンプレート参照: `../sdd-core/references/templates/specs/requirements-init.md`

プレースホルダーを置換:
- `{{PROJECT_DESCRIPTION}}` → ユーザー指定の説明

### Step 5: 完了報告
ユーザーに以下を報告:
- 作成したファイルのパス
- 次のステップ: `sdd-requirements` で要件を生成

## 出力
```
.kiro/specs/{feature}/
├── spec.json          （phase: "initialized"）
└── requirements.md    （Project Description + 空 Requirements セクション）
```

## エラーケース
- 同名の仕様が既に存在する場合 → ユーザーに確認（上書き or 別名）
- 機能名が不正な場合（スペース、特殊文字等）→ kebab-caseに変換して提案
