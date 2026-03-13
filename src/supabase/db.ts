import { supabase } from './client'
import { User, TrackedProfile, ProfileSnapshot, ProfileChange } from '../types'

// ─── USERS ────────────────────────────────────────────────

export async function upsertUser(id: string, fcmToken?: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .upsert({ id, fcm_token: fcmToken ?? null }, { onConflict: 'id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function updateUserPlan(userId: string, plan: 'free' | 'pro') {
  const { error } = await supabase
    .from('users')
    .update({ plan })
    .eq('id', userId)

  if (error) throw error
}

export async function updateFcmToken(userId: string, fcmToken: string) {
  const { error } = await supabase
    .from('users')
    .update({ fcm_token: fcmToken })
    .eq('id', userId)

  if (error) throw error
}

// ─── TRACKED PROFILES ─────────────────────────────────────

export async function getTrackedProfilesByUser(userId: string): Promise<TrackedProfile[]> {
  const { data, error } = await supabase
    .from('tracked_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function addTrackedProfile(
  userId: string,
  username: string
): Promise<TrackedProfile> {
  const { data, error } = await supabase
    .from('tracked_profiles')
    .insert({
      user_id: userId,
      instagram_username: username.toLowerCase().trim(),
      next_scan_at: new Date().toISOString(), // scan immediately
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function removeTrackedProfile(id: string, userId: string) {
  const { error } = await supabase
    .from('tracked_profiles')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error
}

export async function countTrackedProfiles(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('tracked_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) throw error
  return count ?? 0
}

// get profiles that are due for scanning
export async function getProfilesDueForScan(limit = 50): Promise<TrackedProfile[]> {
  const { data, error } = await supabase
    .from('tracked_profiles')
    .select('*')
    .eq('is_active', true)
    .lte('next_scan_at', new Date().toISOString())
    .order('next_scan_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data
}

export async function updateAfterScan(
  profileId: string,
  igUserId: string,
  nextScanAt: Date
) {
  const { error } = await supabase
    .from('tracked_profiles')
    .update({
      instagram_user_id: igUserId,
      last_scanned_at: new Date().toISOString(),
      next_scan_at: nextScanAt.toISOString(),
    })
    .eq('id', profileId)

  if (error) throw error
}

// ─── SNAPSHOTS ────────────────────────────────────────────

export async function saveSnapshot(snapshot: Omit<ProfileSnapshot, 'id' | 'scanned_at'>) {
  const { error } = await supabase
    .from('profile_snapshots')
    .insert(snapshot)

  if (error) throw error
}

export async function getLatestSnapshot(trackedProfileId: string): Promise<ProfileSnapshot | null> {
  const { data, error } = await supabase
    .from('profile_snapshots')
    .select('*')
    .eq('tracked_profile_id', trackedProfileId)
    .order('scanned_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data
}

export async function getSnapshotHistory(
  trackedProfileId: string,
  limit = 30
): Promise<ProfileSnapshot[]> {
  const { data, error } = await supabase
    .from('profile_snapshots')
    .select('*')
    .eq('tracked_profile_id', trackedProfileId)
    .order('scanned_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

// ─── CHANGES ──────────────────────────────────────────────

export async function saveChange(change: Omit<ProfileChange, 'id' | 'detected_at'>) {
  const { error } = await supabase
    .from('profile_changes')
    .insert({ ...change, notification_sent: false })

  if (error) throw error
}

export async function getProfileChanges(
  trackedProfileId: string,
  limit = 30
): Promise<ProfileChange[]> {
  const { data, error } = await supabase
    .from('profile_changes')
    .select('*')
    .eq('tracked_profile_id', trackedProfileId)
    .order('detected_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}
