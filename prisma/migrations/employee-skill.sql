-- 社員スキル管理テーブル (Requirement 4)
-- Issue #35: 共有 SkillGapCalculator のためのスキーマ（Task 11.1）
--
-- 社員が保有するスキルを表現する。
-- - (userId, skillId) の一意制約で「同一社員が同一スキルを複数持てない」ことを保証
-- - (skillId, level) の複合インデックスで「このスキルを level 以上で保有する人」の検索を高速化
-- - マネージャー承認ワークフロー（Task 11.2）のため approvedByManagerId / approvedAt を保持
--
-- SkillGapCalculator は DB 非依存の純関数として実装する（Task 11.1）。
-- 呼び出し元（CareerService / SkillAnalytics）がこのテーブルから取得した行を
-- EmployeeSkill 型に変換して渡す想定。

CREATE TABLE IF NOT EXISTS employee_skills (
  id                    TEXT         NOT NULL PRIMARY KEY,
  "userId"              TEXT         NOT NULL,
  "skillId"             TEXT         NOT NULL,
  -- 保有スキルレベル 1〜5
  level                 INTEGER      NOT NULL,
  "acquiredAt"          TIMESTAMP(3) NOT NULL,
  "approvedByManagerId" TEXT,
  "approvedAt"          TIMESTAMP(3),
  CONSTRAINT employee_skills_user_id_skill_id_key UNIQUE ("userId", "skillId")
);

CREATE INDEX IF NOT EXISTS employee_skills_skill_id_level_idx
  ON employee_skills ("skillId", level);
