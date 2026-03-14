-- Add user list columns to profile_snapshots
ALTER TABLE profile_snapshots
  ADD COLUMN IF NOT EXISTS followers_list JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS following_list JSONB NOT NULL DEFAULT '[]';

-- Add new user columns to profile_changes
ALTER TABLE profile_changes
  ADD COLUMN IF NOT EXISTS new_followers JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS new_following JSONB NOT NULL DEFAULT '[]';
