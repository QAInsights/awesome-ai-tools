CREATE TABLE follows (
    user_id TEXT NOT NULL,
    tool_slug TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, tool_slug),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX follows_user_created_idx ON follows(user_id, created_at DESC);
