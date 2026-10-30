CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('worker','admin')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reward BIGINT NOT NULL CHECK(reward > 0),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK(status IN ('available','claimed','submitted','approved','rejected')),
  worker_id TEXT REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, external_id)
);

CREATE TABLE IF NOT EXISTS task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  UNIQUE(task_id, position)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  expires BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT UNIQUE NOT NULL REFERENCES tasks(id),
  worker_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected')),
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL CHECK(amount > 0),
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','paid','rejected')),
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  amount BIGINT NOT NULL,
  task_id TEXT REFERENCES tasks(id),
  withdrawal_id TEXT REFERENCES withdrawals(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS one_task_credit
ON ledger(task_id) WHERE kind='earning';

CREATE UNIQUE INDEX IF NOT EXISTS one_withdrawal_refund
ON ledger(withdrawal_id) WHERE kind='refund';

CREATE TABLE IF NOT EXISTS moderation (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  status TEXT NOT NULL CHECK(status IN ('hold','correction','released','denied')),
  hold_until BIGINT NOT NULL,
  note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS corrections (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  step_id TEXT REFERENCES task_steps(id),
  note TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS evidence_history (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  step_id TEXT,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leases (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  worker_id TEXT REFERENCES users(id),
  expires BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_policies (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  start_mode TEXT NOT NULL CHECK(start_mode IN ('on_claim','admin_details')),
  claim_minutes INTEGER CHECK(claim_minutes IS NULL OR claim_minutes BETWEEN 1 AND 43200),
  deadline_at BIGINT,
  supplied_at BIGINT,
  expiry_action TEXT NOT NULL DEFAULT 'recycle' CHECK(expiry_action IN ('recycle','hold')),
  public_description INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_compensations (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  worker_id TEXT NOT NULL REFERENCES users(id),
  admin_id TEXT NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL CHECK(amount > 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  username TEXT UNIQUE NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  referrer_id TEXT REFERENCES users(id),
  registered_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_awards (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  referrer_id TEXT REFERENCES users(id),
  worker_id TEXT REFERENCES users(id),
  usd_micros INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_transfers (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  credited_cents BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS paid_dates (
  withdrawal_id TEXT PRIMARY KEY REFERENCES withdrawals(id),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profile_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  chosen_username INTEGER NOT NULL DEFAULT 0,
  preferred_currency TEXT NOT NULL DEFAULT 'USD'
);

CREATE TABLE IF NOT EXISTS referral_links (
  code TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS task_details (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  fields TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  sender_id TEXT REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  owner_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS rates (
  currency TEXT PRIMARY KEY,
  rate BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  usd_cents BIGINT NOT NULL,
  currency TEXT NOT NULL,
  local_minor BIGINT NOT NULL,
  rate BIGINT NOT NULL,
  rate_time BIGINT NOT NULL,
  expires BIGINT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  settlement TEXT NOT NULL DEFAULT 'legacy'
);

CREATE TABLE IF NOT EXISTS withdrawal_details (
  withdrawal_id TEXT PRIMARY KEY REFERENCES withdrawals(id),
  currency TEXT NOT NULL,
  local_minor BIGINT NOT NULL,
  rate BIGINT NOT NULL,
  rate_time BIGINT NOT NULL,
  fee_minor BIGINT NOT NULL DEFAULT 0,
  settlement TEXT NOT NULL DEFAULT 'legacy'
);

CREATE TABLE IF NOT EXISTS exchange_sync (
  id INTEGER PRIMARY KEY CHECK(id=1),
  source TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  next_check BIGINT NOT NULL,
  last_error TEXT
);

-- Contacts and opt-in notification delivery
-- Additive only. Apply on a non-production branch and test before production.
CREATE TABLE IF NOT EXISTS member_contacts (
 user_id TEXT PRIMARY KEY REFERENCES users(id), phone TEXT NOT NULL DEFAULT '',
 whatsapp TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_threads (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), subject TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_messages (
 id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES support_threads(id),
 sender_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_thread ON support_messages(thread_id,created_at);
CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id), email_enabled BOOLEAN NOT NULL DEFAULT false,
 push_enabled BOOLEAN NOT NULL DEFAULT false, confirm_hash TEXT, confirm_expires BIGINT,
 confirm_requested BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), endpoint TEXT UNIQUE NOT NULL,
 subscription TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_sources (
 event_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_inbox (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), event_key TEXT NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL, read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,event_key)
);
CREATE INDEX IF NOT EXISTS notification_inbox_user ON notification_inbox(user_id,created_at);
CREATE TABLE IF NOT EXISTS notification_outbox (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), event_key TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('email','push')), target TEXT NOT NULL,
 payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt BIGINT NOT NULL DEFAULT 0,
 locked_until BIGINT NOT NULL DEFAULT 0, last_error TEXT, sent_at TIMESTAMPTZ,
 UNIQUE(user_id,event_key,channel,target)
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending ON notification_outbox(status,next_attempt);
CREATE TABLE IF NOT EXISTS notification_installation (
 id INTEGER PRIMARY KEY CHECK(id=1), installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
