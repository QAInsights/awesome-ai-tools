CREATE TABLE switch_votes (
    source_tool TEXT NOT NULL,
    voter_key TEXT NOT NULL,
    target_tool TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (source_tool, voter_key)
);
CREATE INDEX switch_votes_source_target_idx ON switch_votes(source_tool, target_tool);
