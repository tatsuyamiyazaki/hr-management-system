# /sdd:init <description>

新しい機能仕様を初期化する

## 実行手順

1. まず以下のスキルファイルを読み込んでください:
   - `sdd-core/SKILL.md` (SDD共通基盤)
   - `sdd-init/SKILL.md` (本コマンドのスキル定義)

2. SKILL.mdの「前提」セクションに記載されたルール・テンプレートファイルを読み込んでください。

3. SKILL.mdの「実行プロセス」に従って処理を実行してください。

## 引数
`<description>`

## 備考
- 全仕様書は日本語で生成（Think in English, generate in Japanese）
- 仕様ファイルは `.kiro/specs/{feature}/` に格納
- ステアリングファイルは `.kiro/steering/` に格納