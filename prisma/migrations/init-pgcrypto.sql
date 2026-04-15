-- init-pgcrypto.sql
-- このファイルは Prisma migrate で生成されるマイグレーションの前に実行する
-- pgcrypto 拡張をインストールし、カラム暗号化の基盤を整備する

-- pgcrypto 拡張のインストール（既存の場合はスキップ）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm 拡張のインストール（FTS/トリグラム検索用）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 使用例（実際のマイグレーションでカラム暗号化に適用）:
-- INSERT INTO users (email, email_hash, ...)
--   VALUES (pgp_sym_encrypt('user@example.com', current_setting('app.encryption_key')), 'hmac_hash', ...)
--
-- SELECT pgp_sym_decrypt(email::bytea, current_setting('app.encryption_key'))
--   FROM users WHERE email_hash = 'hmac_hash'
