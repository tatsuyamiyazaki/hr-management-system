# Sunbit HR Design System

SUNBIT Inc. 人事管理プラットフォームのためのデザインシステム。
スキル管理・360度評価・目標管理・1on1・キャリア管理などを一元化する日本語ファーストのエンタープライズHRアプリケーション向け。

## プロダクト概要

SUNBIT Inc. は、組織課題（組織体制・人材配置・人事評価）を一元管理する HR プラットフォームを提供する。AIを活用したコーチング機能付き360度評価により、フィードバック文化の醸成と社員の継続的成長を支援する。

### ユーザーロール（4階層）

| ロール         | 主な役割                                                               |
| -------------- | ---------------------------------------------------------------------- |
| **ADMIN**      | 等級マスタ・ウェイト設定・監査ログ監視・AIコスト管理                   |
| **HR_MANAGER** | 評価サイクルの設定・進捗モニタリング・総合評価の確定・異議申立ての審査 |
| **MANAGER**    | 部下の目標承認・1on1ログ蓄積・AI対話で高品質フィードバック入力         |
| **EMPLOYEE**   | 自己評価・ピア評価・キャリア希望表明・FB受領・異議申立て               |

### コア機能（19 ドメイン）

組織体制・スキルマップ・キャリア・目標管理（OKR/MBO）・1on1・360度評価・AIコーチ・フィードバック変換・インセンティブ・総合評価・ダッシュボード・ライフサイクル・通知・検索・監査ログ・異議申立て・AIコスト監視。

### 差別化ポイント

- **ピア主導の360度評価**: 「誰を評価するか」を社員自身が選び、最低評価者数で匿名性と統計的信頼性を両立
- **AI品質ゲート**: 品質基準を満たすまで評価送信をブロックし、建設的フィードバックを自動担保
- **マイルド化変換**: ネガティブ表現を AI が建設的な表現に変換し、被評価者のメンタル負荷を軽減
- **評価者インセンティブ**: 評価行動自体を評価に加算し、フィードバック文化を促進

## ソース

すべての情報は以下のソースから抽出・推論した（プロダクトの UI コードは未提供のため、技術スタック準拠の shadcn/ui ベースの推定デザイン）。

- GitHub: `tatsuyamiyazaki/Claude-Design-Test`
  - `.kiro/steering/product.md` — プロダクト概要
  - `.kiro/steering/tech.md` — 技術スタック（Next.js 15 / shadcn/ui / Tailwind CSS 4 / PostgreSQL / Prisma / Claude API）
  - `.kiro/steering/structure.md` — 19ドメイン構成
  - `.kiro/specs/hr-management-platform/design.md` — 詳細な技術設計書（75KB）
  - `.kiro/specs/hr-management-platform/requirements.md` — 20要件 152受け入れ基準

> ⚠️ 注意: 本リポジトリには実装コード（UIコンポーネント）がまだ存在しないため、本デザインシステムは仕様書・技術スタック選択（shadcn/ui + Tailwind CSS 4）から導出した推定デザインである。実装着手後、本デザインシステムを実装と同期すること。

---

## CONTENT FUNDAMENTALS（コピーとトーン）

### 言語

- **完全日本語**（Phase 1）。Phase 2 で英語/多言語対応予定。
- タイムゾーンは **Asia/Tokyo** 固定（Phase 1）。
- 敬体（です・ます調）を基本とし、ボタン・ラベルは体言止めも可。

### トーン

- **信頼・透明・落ち着き**。人事評価という繊細な領域のため、過度な感情表現を避ける。
- **建設的**: AIコーチング文脈では「〜が不足しています」ではなく「具体的なエピソードを追加すると伝わりやすくなります」のように提案型で書く。
- **心理的安全性を担保**: マイルド化変換後のフィードバックは攻撃性を取り除き、成長につながる表現を優先。

### 敬称・人称

- **「自分」「あなた」** よりも役職・ロール名を使う（例：「評価対象者」「マネージャー」「被評価者」）。
- ADMIN 向けUIではやや事務的（「〜を確定」「〜を記録」）、EMPLOYEE 向けUIではやや支援的（「〜してみましょう」「〜を登録」）。

### ラベル表現例（推定・shadcn/ui 慣習 + 日本語UX）

| 英               | 和（このシステム） |
| ---------------- | ------------------ |
| Dashboard        | ダッシュボード     |
| Evaluation Cycle | 評価サイクル       |
| Self Evaluation  | 自己評価           |
| Peer Evaluation  | ピア評価           |
| Goal (OKR/MBO)   | 目標（OKR/MBO）    |
| Approve          | 承認               |
| Reject / Decline | 差し戻し／辞退     |
| Submit           | 送信               |
| Finalize         | 確定               |
| Draft            | 下書き             |
| Pending Approval | 承認待ち           |
| Feedback         | フィードバック     |

### カジュアル表現の扱い

- **絵文字は原則不使用**。業務ツールとしての信頼性を優先。ステータスバッジは色とアイコンで表現。
- **感嘆符（！）控えめ**。重要通知・成功時のみ軽く使う程度。
- **マイクロコピー例**:
  - 空状態: 「まだ登録されていません」「該当する社員が見つかりません」
  - 確認: 「この操作は取り消せません。本当に確定しますか？」
  - 成功: 「保存しました」「送信しました」
  - エラー: 「入力内容を確認してください」「通信エラーが発生しました。時間をおいて再度お試しください」

---

## VISUAL FOUNDATIONS

### カラー戦略

- **Primary (Sunbit Navy)**: `#1F2C69` — 公式ロゴの「sun」部分から採用した深いネイビー。信頼・落ち着き・持続性を表現する。CTA・アクティブ状態・選択に使用。
- **Logo Gray (補助)**: `#7A7B7F` — ロゴの「Bit」部分から。Navyとペアでロゴを構成するが、UI 内では Slate を優先しこの色は限定的に使う。
- **Neutral (Slate/Zinc 系)**: テキスト・背景・境界線。コンテンツを邪魔しない。
- **Semantic**:
  - Success `#16A34A`（承認・完了）
  - Warning `#D97706`（期限近・注意）
  - Danger `#DC2626`（エラー・差し戻し・異議申立て）
  - Info `#2563EB`（通知・進行中）
- **AI 関連**: `#7C3AED`（Violet）— AIコーチング、AI変換、AIインサイトの文脈で控えめに。
- トーン: 全体的に **低彩度・高コントラスト**。過度な彩度やネオンは使わない。

### タイポグラフィ

- **日本語 UI 本文**: `"Noto Sans JP"`（ウェイト 400/500/700）
- **欧文・数値**: `"Inter"`（ウェイト 400/500/600/700）— 数値密度が高いダッシュボード向け
- **モノスペース**: `"JetBrains Mono"`（監査ログ・ID・コード表示）
- 数値は **tabular-nums** を指定。評価スコア・KPI で桁揃え。

> フォント置換の注意: 社内指定フォントがあれば `fonts/` に TTF/WOFF2 を配置して `@font-face` で置換してください。現在は Google Fonts から読み込み。

### スケール・密度

- ベース: 16px / 1.5 行間
- UI 表示密度は **Medium**（shadcn/ui デフォルト）。ダッシュボードで情報量が多いため、密度の低下を避ける。

### レイアウト原則

- **サイドバー + メインキャンバス**: 左サイドバー 240px 固定、上部ヘッダー 56px、コンテンツ最大幅 1440px。
- **カード主体**: セクション区切りはカード（白背景 + 1px 境界線 + 8px 角丸 + 極淡シャドウ）。
- **データ密度**: テーブル・リスト主体。ヒートマップ・レーダー・折れ線グラフは shadcn/ui チャート（Recharts）準拠。

### 背景

- ページ背景 `#F8FAFC`（Slate-50）、カード背景 `#FFFFFF`。
- フルブリード画像・装飾的グラデーション・パターンは **使わない**（エンタープライズ HR として）。ログイン画面のみ控えめな Navy 系アクセント（右側の illustration スペース）を許容。

### 角丸 (Radius)

- `--radius-sm: 4px`（バッジ・タグ）
- `--radius-md: 6px`（ボタン・入力）
- `--radius-lg: 8px`（カード・モーダル）
- `--radius-xl: 12px`（ヒーローセクション）
- 角丸過多を避け、**データ系テーブルは角丸なし**。

### シャドウ

- Elevation 0: なし（平坦）
- Elevation 1: `0 1px 2px rgba(15,23,42,0.06)` — カード
- Elevation 2: `0 4px 12px rgba(15,23,42,0.08)` — ドロップダウン
- Elevation 3: `0 12px 32px rgba(15,23,42,0.12)` — モーダル・ポップオーバー
- Inner shadow は原則不使用。

### 境界線（Border）

- カラー: `#E2E8F0`（Slate-200）を基本。
- 強調時: `#CBD5E1`（Slate-300）。
- アクティブ状態のみ Primary の 2px ring + ring-offset（shadcn/ui focus-visible 慣習）。

### ホバー・プレス

- **Hover**: 背景を `bg-muted` (`#F1F5F9`) に。ボタンは 4% 暗色化。
- **Active/Press**: `scale(0.98)` + さらに 4% 暗色化。
- **Focus**: Primary 2px ring + 2px offset（キーボードナビゲーション重視、WCAG 2.1 AA 準拠）。
- **Disabled**: opacity 0.5 + cursor-not-allowed。

### アニメーション

- 推奨 easing: `cubic-bezier(0.16, 1, 0.3, 1)`（ease-out-expo 系、shadcn/ui 慣習）。
- Duration: 150ms（hover/focus）, 200ms（ポップオーバー・トースト）, 300ms（モーダル・シート）。
- バウンス系アニメーションは使わない。**フェード + 微小な上下スライド** が基本。
- ページ遷移は Next.js App Router に任せる（明示的なトランジションなし）。

### 透明度・ブラー

- モーダルオーバーレイ: `rgba(15, 23, 42, 0.4)` + `backdrop-blur-sm`。
- ポップオーバー: 透明度なし（視認性優先）。
- **Glassmorphism は使わない**。

### コンポーネント詳細

- **カード**: 白背景、1px境界、8px角丸、elevation-1。内側パディング 24px。
- **ボタン**:
  - Primary: Navy塗り + 白文字
  - Secondary: 白 + 境界線 + 濃いグレー文字
  - Ghost: 透明 + hover で bg-muted
  - Destructive: Danger塗り + 白文字
- **フォーム入力**: 白背景、1px 境界、6px 角丸、focus で Primary ring。
- **バッジ（ステータス）**: セマンティックカラーの 10% 塗り + 同系濃色テキスト。

### イメージトーン

- ログイン・空状態の illustration（将来追加）は **落ち着いた Navy 系・低彩度・手描き風ではないフラット**。AIスロップ的な過剰な抽象アートは避ける。

---

## ICONOGRAPHY

Sunbit HR にはカスタムアイコンシステムがまだ存在しないため、**Lucide Icons**（shadcn/ui のデフォルト）を採用する。Lucide は：

- ストローク 2px、24×24 viewBox、丸みのある角
- 業務アプリ向けのニュートラルさ
- shadcn/ui の指定に完全準拠

### CDN

```html
<script src="https://unpkg.com/lucide@latest"></script>
```

または React 版:

```
import { User, Calendar, CheckCircle2 } from 'lucide-react';
```

### よく使うアイコン（ドメインごと）

| ドメイン       | アイコン                                              |
| -------------- | ----------------------------------------------------- |
| 認証・ユーザー | `user`, `users`, `user-check`, `log-out`, `key-round` |
| 組織           | `building-2`, `network`, `users-round`                |
| スキル         | `sparkles`, `target`, `chart-line`                    |
| キャリア       | `compass`, `milestone`, `route`                       |
| 目標 (OKR/MBO) | `target`, `flag`, `trending-up`, `circle-check-big`   |
| 1on1           | `messages-square`, `calendar`, `clock`                |
| 評価 (360°)    | `scan-face`, `circle-user-round`, `vote`              |
| AI             | `sparkles`, `bot`, `wand-2`                           |
| フィードバック | `message-square-heart`, `inbox`                       |
| 通知           | `bell`, `bell-ring`, `mail`                           |
| 異議申立て     | `scale`, `file-warning`                               |
| 監査ログ       | `shield-check`, `history`, `file-text`                |
| ダッシュボード | `layout-dashboard`, `bar-chart-3`, `pie-chart`        |
| 管理           | `settings`, `sliders-horizontal`, `database`          |

### 絵文字・Unicode

- **絵文字は UI 内では使わない**（通知本文・カスタムブロードキャストで送信者が入力した絵文字は表示可）。
- Unicode 矢印・記号（↗ ↑ ↓ ▲ ▼ ✓ ✗）は KPI の変化表示に限り利用可能。

### 代替

カスタムアイコンが将来定義された場合、Lucide をベースに同じストローク幅 2px を踏襲すること。

---

## ロゴ

公式ワードマークを `assets/logo.png`（701×298, 透明 PNG）に配置。

- **Wordmark の使い方**: 白・淡い背景上ではそのまま、Navy背景上では `filter: brightness(0) invert(1)` で反転して白単色として使用。
- **Mark (`logo-mark.svg`)**: 小さい枠（サイドバー・アプリアイコン・favicon）に使う Navy 地の角丸正方形に白文字 S のマーク。
- **最小寸法**: Wordmark 高さ 20px / Mark 辺長 24px。
- **クリアスペース**: ロゴの周囲に `x高さ` 以上の余白を確保。

---

## 索引（ファイル一覧）

| ファイル              | 内容                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `README.md`           | このファイル                                                             |
| `SKILL.md`            | Claude Code / Claude.ai 用スキル定義                                     |
| `colors_and_type.css` | カラー・タイポグラフィの CSS カスタムプロパティ                          |
| `fonts/`              | ウェブフォント（Google Fonts CDN 経由）                                  |
| `assets/`             | ロゴ・アイコン・イメージ                                                 |
| `preview/`            | デザインシステムトークンのプレビューカード（HTML）                       |
| `ui_kits/hr-app/`     | メイン HR アプリケーション UI キット（ダッシュボード・評価・目標・1on1） |

### UI キット

- **`ui_kits/hr-app/`** — HR プラットフォーム本体の UI キット（Next.js + shadcn/ui 準拠の HTML/JSX モック）

---

## 注意・既知の制約

- 本デザインシステムは **仕様書ベースの推定** である。実 UI コードが無い。
- フォントは Google Fonts 経由で Noto Sans JP + Inter + JetBrains Mono を使用。社内指定フォントがあれば差し替え。
- **ロゴ**: 公式ワードマークは PNG（ビットマップ）。ベクター版（SVG）が入手できたらよりシャープな表示が可能になるため、差し替えを推奨。
- アイコンは Lucide で代替。自社アイコンセットが作成された場合、差し替え推奨。
