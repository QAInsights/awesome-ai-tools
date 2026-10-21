PRAGMA defer_foreign_keys = ON;

CREATE TABLE sessions_bak_0011 AS SELECT * FROM sessions;
CREATE TABLE favorites_bak_0011 AS SELECT * FROM favorites;
CREATE TABLE follows_bak_0011 AS SELECT * FROM follows;
CREATE TABLE notification_prefs_bak_0011 AS SELECT * FROM notification_prefs;
CREATE TABLE user_onboarding_bak_0011 AS SELECT * FROM user_onboarding;
CREATE TABLE username_history_bak_0011 AS SELECT * FROM username_history;
CREATE TABLE stacks_bak_0011 AS SELECT * FROM stacks;
CREATE TABLE stack_slug_history_bak_0011 AS SELECT * FROM stack_slug_history;
CREATE TABLE stack_items_bak_0011 AS SELECT * FROM stack_items;

CREATE TABLE users_next (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'github', 'email')),
    provider_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    github_username TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    username TEXT,
    CHECK (id = provider || ':' || provider_user_id)
);

INSERT INTO users_next (
    id,
    provider,
    provider_user_id,
    display_name,
    email,
    avatar_url,
    github_username,
    email_verified,
    created_at,
    updated_at,
    last_seen_at,
    username
)
SELECT
    id,
    provider,
    provider_user_id,
    display_name,
    email,
    avatar_url,
    github_username,
    email_verified,
    created_at,
    updated_at,
    last_seen_at,
    username
FROM users;

DROP TABLE users;
ALTER TABLE users_next RENAME TO users;

CREATE UNIQUE INDEX users_provider_identity_idx ON users(provider, provider_user_id);
CREATE INDEX users_created_at_idx ON users(created_at);
CREATE INDEX users_last_seen_at_idx ON users(last_seen_at);
CREATE UNIQUE INDEX users_username_idx ON users(username);

INSERT INTO sessions SELECT * FROM sessions_bak_0011;
INSERT INTO favorites SELECT * FROM favorites_bak_0011;
INSERT INTO follows SELECT * FROM follows_bak_0011;
INSERT INTO notification_prefs SELECT * FROM notification_prefs_bak_0011;
INSERT INTO user_onboarding SELECT * FROM user_onboarding_bak_0011;
INSERT INTO username_history SELECT * FROM username_history_bak_0011;
INSERT INTO stacks SELECT * FROM stacks_bak_0011;
INSERT INTO stack_slug_history SELECT * FROM stack_slug_history_bak_0011;
INSERT INTO stack_items SELECT * FROM stack_items_bak_0011;

DROP TABLE sessions_bak_0011;
DROP TABLE favorites_bak_0011;
DROP TABLE follows_bak_0011;
DROP TABLE notification_prefs_bak_0011;
DROP TABLE user_onboarding_bak_0011;
DROP TABLE username_history_bak_0011;
DROP TABLE stacks_bak_0011;
DROP TABLE stack_slug_history_bak_0011;
DROP TABLE stack_items_bak_0011;

CREATE TABLE email_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at INTEGER
);

CREATE INDEX email_otps_email_created_idx ON email_otps(email, created_at DESC);

PRAGMA defer_foreign_keys = OFF;
