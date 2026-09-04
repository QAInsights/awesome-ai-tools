PRAGMA foreign_keys = ON;

CREATE TABLE user_onboarding (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_completed_at INTEGER,
    dismissed_at INTEGER,
    completed_at INTEGER,
    updated_at INTEGER NOT NULL
);
