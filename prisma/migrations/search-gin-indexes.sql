-- Issue #33 / Req 16.1, 16.2: 社員検索用 GIN インデックス
--
-- pg_trgm 拡張は init-pgcrypto.sql で有効化済み。
-- profiles テーブルの氏名カラムおよび departments テーブルの name カラムに
-- pg_trgm GIN インデックスを作成し、ILIKE 部分一致検索を高速化する。
--
-- また、FTS 用に tsvector を生成する search_vector カラムを追加し、
-- GIN インデックスを張る。

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pg_trgm GIN インデックス（部分一致 ILIKE 高速化）
-- ─────────────────────────────────────────────────────────────────────────────

-- 氏名（姓）
CREATE INDEX IF NOT EXISTS idx_profiles_last_name_trgm
  ON profiles USING gin (last_name gin_trgm_ops);

-- 氏名（名）
CREATE INDEX IF NOT EXISTS idx_profiles_first_name_trgm
  ON profiles USING gin (first_name gin_trgm_ops);

-- 氏名カナ（姓）
CREATE INDEX IF NOT EXISTS idx_profiles_last_name_kana_trgm
  ON profiles USING gin (last_name_kana gin_trgm_ops);

-- 氏名カナ（名）
CREATE INDEX IF NOT EXISTS idx_profiles_first_name_kana_trgm
  ON profiles USING gin (first_name_kana gin_trgm_ops);

-- 部署名
CREATE INDEX IF NOT EXISTS idx_departments_name_trgm
  ON departments USING gin (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. tsvector GENERATED カラム + GIN インデックス（FTS 全文検索）
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles に search_vector GENERATED カラムを追加
-- firstName / lastName / firstNameKana / lastNameKana を結合した tsvector
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(last_name, '') || ' ' ||
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name_kana, '') || ' ' ||
      coalesce(first_name_kana, '')
    )
  ) STORED;

-- search_vector に GIN インデックス
CREATE INDEX IF NOT EXISTS idx_profiles_search_vector
  ON profiles USING gin (search_vector);
