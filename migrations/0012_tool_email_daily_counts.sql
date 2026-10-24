-- Per-account daily cap for "Email me this" result emails.
CREATE TABLE tool_email_daily_counts (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 0),
    PRIMARY KEY (user_id, day)
);
