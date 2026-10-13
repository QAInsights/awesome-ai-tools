CREATE TABLE zap_votes (
    tool_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('redis', 'd1')),
    PRIMARY KEY (tool_id, voter_id)
);
CREATE INDEX zap_votes_source_tool_idx ON zap_votes(source, tool_id);

CREATE TABLE zap_legacy_counts (
    tool_id TEXT PRIMARY KEY,
    count INTEGER NOT NULL CHECK (count >= 0)
);
