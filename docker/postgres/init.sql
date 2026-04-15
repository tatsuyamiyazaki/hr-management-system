-- ─────────────────────────────────────────────────────────────
-- HR Management System — PostgreSQL 初期化スクリプト
-- このスクリプトはコンテナ初回起動時に自動実行されます
-- ─────────────────────────────────────────────────────────────

-- pgcrypto: AES-256 カラム暗号化 (pgp_sym_encrypt / pgp_sym_decrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm: 社員名の部分一致検索 (GIN インデックス対応)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- uuid-ossp: UUID 生成 (Prisma のデフォルト ID 生成をサポート)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- Shadow DB (Prisma マイグレーション用)
-- ─────────────────────────────────────────────────────────────
-- マイグレーション時に Shadow DB が必要な場合は環境変数で設定してください。
-- 本番環境では SHADOW_DATABASE_URL を別途設定することを推奨します。
