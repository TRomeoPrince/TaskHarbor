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
INSERT INTO notification_installation(id) VALUES(1) ON CONFLICT DO NOTHING;
