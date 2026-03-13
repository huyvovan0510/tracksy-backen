export type Plan = 'free' | 'pro'

export interface User {
  id: string // anonymous device UUID
  plan: Plan
  fcm_token: string | null
  created_at: string
}

export interface TrackedProfile {
  id: string
  user_id: string
  instagram_username: string
  instagram_user_id: string | null
  next_scan_at: string
  created_at: string
}

export interface ProfileSnapshot {
  id: string
  tracked_profile_id: string
  instagram_username: string
  followers_count: number
  following_count: number
  profile_pic_url: string | null
  bio: string | null
  full_name: string | null
  is_private: boolean
  is_verified: boolean
  scanned_at: string
}

export interface ProfileChange {
  tracked_profile_id: string
  instagram_username: string
  followers_before: number
  followers_after: number
  followers_diff: number
  following_before: number
  following_after: number
  following_diff: number
  notification_sent: boolean
  detected_at: string
}

export interface IgAccount {
  username: string
  password: string
}
