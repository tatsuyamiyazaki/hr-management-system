-- 社員スキルテーブル (Requirement 4.4, 4.5)
-- Issue #36 / Task 11.2: 社員スキル登録とマネージャー承認
--
-- - level は 1〜5 (アプリ層で検証)
-- - approvedByManagerId / approvedAt が NULL なら「承認待ち」、値があれば「承認済み」
-- - (userId, skillId) で一意制約 (1 ユーザー・1 スキル)

CREATE TABLE IF NOT EXISTS employee_skills (
  id                    TEXT         NOT NULL PRIMARY KEY,
  "userId"              TEXT         NOT NULL,
  "skillId"             TEXT         NOT NULL,
  level                 INTEGER      NOT NULL,
  "acquiredAt"          TIMESTAMP(3) NOT NULL,
  "approvedByManagerId" TEXT,
  "approvedAt"          TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT employee_skills_user_skill_unique UNIQUE ("userId", "skillId")
);

CREATE INDEX IF NOT EXISTS employee_skills_skill_level_idx
  ON employee_skills ("skillId", level);
CREATE INDEX IF NOT EXISTS employee_skills_user_idx
  ON employee_skills ("userId");
