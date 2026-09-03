ALTER TABLE notification_prefs ADD COLUMN news_enabled INTEGER NOT NULL DEFAULT 0 CHECK (news_enabled IN (0, 1));
