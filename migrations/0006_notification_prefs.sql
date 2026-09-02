CREATE TABLE notification_prefs (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_enabled IN (0, 1)),
    unsubscribe_token TEXT NOT NULL UNIQUE,
    last_digest_sent_at INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE TABLE email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    tool_slugs TEXT,
    message_id TEXT,
    sent_at INTEGER NOT NULL
);

CREATE INDEX email_log_user_sent_idx ON email_log(user_id, sent_at DESC);
