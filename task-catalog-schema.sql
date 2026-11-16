-- TaskHarbor work discovery metadata (additive; no legacy task rewriting).
-- Apply ONLY after a verified live database backup, with the associated app revision.
CREATE TABLE IF NOT EXISTS task_catalog (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('microtask','survey','ai','transcription','annotation','project','general')),
  reward_unit TEXT NOT NULL DEFAULT 'task'
    CHECK (reward_unit IN ('task','item','batch','clip','recorded_minute','milestone')),
  expected_minutes INTEGER
    CHECK (expected_minutes IS NULL OR expected_minutes BETWEEN 1 AND 43200),
  skill_level TEXT NOT NULL DEFAULT 'any'
    CHECK (skill_level IN ('any','beginner','intermediate','advanced')),
  public_summary TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS task_catalog_category ON task_catalog(category);
