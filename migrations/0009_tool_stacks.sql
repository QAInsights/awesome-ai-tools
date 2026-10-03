PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX users_username_idx ON users(username);

CREATE TABLE username_history (
    username TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    retired_at INTEGER NOT NULL
);

CREATE TABLE stacks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (user_id, slug)
);
CREATE INDEX stacks_user_updated_idx ON stacks(user_id, updated_at DESC);
CREATE INDEX stacks_public_updated_idx ON stacks(is_public, updated_at DESC);

CREATE TABLE stack_slug_history (
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    stack_id TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, slug)
);

CREATE TABLE stack_items (
    stack_id TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
    tool_slug TEXT NOT NULL,
    position INTEGER NOT NULL,
    purpose TEXT NOT NULL,
    usage_notes TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    PRIMARY KEY (stack_id, tool_slug)
);
CREATE INDEX stack_items_tool_idx ON stack_items(tool_slug);
