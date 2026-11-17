-- Additive worker qualification & task prerequisite schema.
-- Apply only after staging verification and verified production backup.
CREATE TABLE IF NOT EXISTS worker_qualifications (
 user_id TEXT NOT NULL REFERENCES users(id),
 skill TEXT NOT NULL CHECK(skill IN ('ai_evaluation','transcription','annotation','research','software','design','data_entry')),
 level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3),
 verified_by TEXT NOT NULL REFERENCES users(id),
 verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,skill)
);
CREATE TABLE IF NOT EXISTS task_requirements (
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 skill TEXT NOT NULL CHECK(skill IN ('ai_evaluation','transcription','annotation','research','software','design','data_entry')),
 min_level INTEGER NOT NULL CHECK(min_level BETWEEN 1 AND 3),
 PRIMARY KEY(task_id,skill)
);
CREATE INDEX IF NOT EXISTS task_requirements_skill_idx ON task_requirements(skill,min_level);
