import { Job } from 'bullmq'
import { fetchProfile } from '../services/instagram.service'
import { sendPushNotification } from '../services/notification.service'
import {
  getLatestSnapshot,
  saveSnapshot,
  saveChange,
  updateAfterScan,
  getUserById,
} from '../supabase/db'
import { config } from '../config'
import { TrackedProfile } from '../types'

export interface ScanJobData {
  trackedProfile: TrackedProfile
  userId: string
}

export async function processScanJob(job: Job<ScanJobData>) {
  const { trackedProfile, userId } = job.data
  const { id: profileId, instagram_username: username } = trackedProfile

  console.log(`[SCAN] Starting scan for @${username} (profileId: ${profileId})`)

  // ── 1. Fetch fresh data from Instagram ──────────────────
  const fresh = await fetchProfile(username)

  // ── 2. Get last snapshot to compare ─────────────────────
  const lastSnapshot = await getLatestSnapshot(profileId)

  // ── 3. Save new snapshot ─────────────────────────────────
  await saveSnapshot({
    tracked_profile_id: profileId,
    instagram_username: username,
    followers_count: fresh.followersCount,
    following_count: fresh.followingCount,
    profile_pic_url: fresh.profilePicUrl,
    bio: fresh.bio,
    full_name: fresh.fullName,
    is_private: fresh.isPrivate,
    is_verified: fresh.isVerified,
  })

  // ── 4. Compare with last snapshot ────────────────────────
  if (lastSnapshot) {
    const followersDiff = fresh.followersCount - lastSnapshot.followers_count
    const followingDiff = fresh.followingCount - lastSnapshot.following_count
    const hasChanged = followersDiff !== 0 || followingDiff !== 0

    if (hasChanged) {
      console.log(`[SCAN] Change detected for @${username}: followers ${lastSnapshot.followers_count} → ${fresh.followersCount}`)

      // ── 5. Save change record ──────────────────────────
      await saveChange({
        tracked_profile_id: profileId,
        instagram_username: username,
        followers_before: lastSnapshot.followers_count,
        followers_after: fresh.followersCount,
        followers_diff: followersDiff,
        following_before: lastSnapshot.following_count,
        following_after: fresh.followingCount,
        following_diff: followingDiff,
        notification_sent: false,
      })

      // ── 6. Send push notification to user ─────────────
      const user = await getUserById(userId)
      if (user?.fcm_token) {
        const title = buildNotificationTitle(username, followersDiff)
        const body = buildNotificationBody(fresh.followersCount, followersDiff)
        await sendPushNotification(user.fcm_token, title, body, {
          type: 'follower_change',
          username,
          profileId,
        })
      }
    } else {
      console.log(`[SCAN] No change for @${username}`)
    }
  } else {
    console.log(`[SCAN] First scan for @${username} — baseline saved`)
  }

  // ── 7. Schedule next scan in 6 hours ────────────────────
  const nextScanAt = new Date()
  nextScanAt.setHours(nextScanAt.getHours() + config.plans.pro.scanIntervalHours)

  // add random offset (0–30 min) to avoid all scans firing at same time
  const randomOffsetMs = Math.floor(Math.random() * 30 * 60 * 1000)
  nextScanAt.setTime(nextScanAt.getTime() + randomOffsetMs)

  await updateAfterScan(profileId, fresh.igUserId, nextScanAt)

  console.log(`[SCAN] Done @${username} — next scan at ${nextScanAt.toISOString()}`)
}

// ─── Notification message builders ────────────────────────

function buildNotificationTitle(username: string, followersDiff: number): string {
  if (followersDiff > 0) return `@${username} gained followers`
  if (followersDiff < 0) return `@${username} lost followers`
  return `@${username} stats changed`
}

function buildNotificationBody(currentFollowers: number, diff: number): string {
  const formatted = currentFollowers.toLocaleString()
  if (diff > 0) return `+${diff} followers — now at ${formatted}`
  if (diff < 0) return `${diff} followers — now at ${formatted}`
  return `Now at ${formatted} followers`
}
