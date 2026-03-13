-- =============================================
-- TRACKSY DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =============================================


-- =============================================
-- USERS
-- Anonymous device users, no login required
-- =============================================
CREATE TABLE users (
  id            UUID PRIMARY KEY,              -- generated on device
  plan          TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro'
  fcm_token     TEXT,                          -- for push notifications
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================
-- SUBSCRIPTIONS
-- Tracks App Store / Google Play purchases
-- =============================================
CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL,   -- 'ios' | 'android'
  product_id        TEXT NOT NULL,   -- e.g. 'com.tracksy.pro.monthly'
  purchase_token    TEXT,            -- Google Play token
  receipt_data      TEXT,            -- Apple receipt
  status            TEXT NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'cancelled'
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================
-- TRACKED PROFILES
-- Profiles that pro users are monitoring
-- =============================================
CREATE TABLE tracked_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instagram_username    TEXT NOT NULL,
  instagram_user_id     TEXT,                  -- numeric IG user id, filled on first scan
  next_scan_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_scanned_at       TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- one user cannot track same username twice
  UNIQUE(user_id, instagram_username)
);


-- =============================================
-- PROFILE SNAPSHOTS
-- Data captured on each scan
-- =============================================
CREATE TABLE profile_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_profile_id    UUID NOT NULL REFERENCES tracked_profiles(id) ON DELETE CASCADE,
  instagram_username    TEXT NOT NULL,
  followers_count       INTEGER NOT NULL DEFAULT 0,
  following_count       INTEGER NOT NULL DEFAULT 0,
  profile_pic_url       TEXT,
  bio                   TEXT,
  full_name             TEXT,
  is_private            BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  scanned_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================
-- PROFILE CHANGES
-- Detected differences between scans
-- =============================================
CREATE TABLE profile_changes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_profile_id    UUID NOT NULL REFERENCES tracked_profiles(id) ON DELETE CASCADE,
  instagram_username    TEXT NOT NULL,
  followers_before      INTEGER NOT NULL,
  followers_after       INTEGER NOT NULL,
  followers_diff        INTEGER NOT NULL,  -- positive = gained, negative = lost
  following_before      INTEGER NOT NULL,
  following_after       INTEGER NOT NULL,
  following_diff        INTEGER NOT NULL,
  notification_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================
-- INDEXES for performance
-- =============================================

-- look up tracked profiles by user often
CREATE INDEX idx_tracked_profiles_user_id ON tracked_profiles(user_id);

-- scan worker queries by next_scan_at to find due profiles
CREATE INDEX idx_tracked_profiles_next_scan ON tracked_profiles(next_scan_at)
  WHERE is_active = TRUE;

-- get latest snapshot for a profile
CREATE INDEX idx_snapshots_profile_scanned ON profile_snapshots(tracked_profile_id, scanned_at DESC);

-- get changes for a profile
CREATE INDEX idx_changes_profile ON profile_changes(tracked_profile_id, detected_at DESC);

-- subscription lookup by user
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);


-- =============================================
-- AUTO UPDATE updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
