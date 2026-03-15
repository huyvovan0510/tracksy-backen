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
import { TrackedProfile, IgUser } from '../types'

export interface ScanJobData {
  trackedProfile: TrackedProfile
  userId: string
}

// ─── Diff helpers ──────────────────────────────────────────

function diffUsers(current: IgUser[], previous: IgUser[]): IgUser[] {
  const prevPks = new Set(previous.map(u => u.pk))
  return current.filter(u => !prevPks.has(u.pk))
}

// ─── Notification builders ─────────────────────────────────

function buildFollowerNotification(
  username: string,
  newFollowers: IgUser[],
  isPrivate: boolean,
  followersDiff: number
): { title: string; body: string } {
  // Private account — no user info available
  if (isPrivate || newFollowers.length === 0) {
    if (followersDiff > 0) {
      return {
        title: `@${username} has new followers`,
        body: `Someone just followed @${username}`,
      }
    }
    if (followersDiff < 0) {
      return {
        title: `@${username} lost followers`,
        body: `Someone unfollowed @${username}`,
      }
    }
    return {
      title: `@${username} stats changed`,
      body: `Follower count updated for @${username}`,
    }
  }

  // Public account — show specific user info
  const first = newFollowers[0]
  const name = first.fullName?.trim() || `@${first.username}`

  if (newFollowers.length === 1) {
    return {
      title: `New follower on @${username}`,
      body: `${name} just followed @${username}`,
    }
  }

  const others = newFollowers.length - 1
  return {
    title: `New followers on @${username}`,
    body: `${name} and ${others} other${others > 1 ? 's' : ''} just followed @${username}`,
  }
}

function buildFollowingNotification(
  username: string,
  newFollowing: IgUser[],
  isPrivate: boolean,
  followingDiff: number
): { title: string; body: string } | null {
  // Only notify for following changes if we have specific users (public accounts)
  if (isPrivate || newFollowing.length === 0) {
    if (followingDiff === 0) return null
    return {
      title: `@${username} followed someone`,
      body: `@${username} just followed someone new`,
    }
  }

  const first = newFollowing[0]
  const name = first.fullName?.trim() || `@${first.username}`

  if (newFollowing.length === 1) {
    return {
      title: `@${username} is following someone new`,
      body: `@${username} just followed ${name}`,
    }
  }

  const others = newFollowing.length - 1
  return {
    title: `@${username} is following new people`,
    body: `@${username} just followed ${name} and ${others} other${others > 1 ? 's' : ''}`,
  }
}

// ─── Main job processor ────────────────────────────────────

export async function processScanJob(job: Job<ScanJobData>) {
  const { trackedProfile, userId } = job.data
  const { id: profileId, instagram_username: username } = trackedProfile

  console.log(`[SCAN] Starting scan for @${username} (profileId: ${profileId})`)

  // ── 1. Fetch fresh data from Instagram ──────────────────
  const fresh = await fetchProfile(username)

  // ── 2. Get last snapshot to compare ─────────────────────
  const lastSnapshot = await getLatestSnapshot(profileId)

  // ── 3. Diff first, then enrich lists with isNew ──────────
  const newFollowers = lastSnapshot
    ? diffUsers(fresh.followers, lastSnapshot.followers_list ?? [])
    : []
  const newFollowing = lastSnapshot
    ? diffUsers(fresh.following, lastSnapshot.following_list ?? [])
    : []

  const newFollowerPks = new Set(newFollowers.map(u => u.pk))
  const newFollowingPks = new Set(newFollowing.map(u => u.pk))

  const enrichedFollowers = fresh.followers.map(u => ({ ...u, isNew: newFollowerPks.has(u.pk) }))
  const enrichedFollowing = fresh.following.map(u => ({ ...u, isNew: newFollowingPks.has(u.pk) }))

  // ── 4. Save new snapshot (with isNew flags) ───────────────
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
    followers_list: enrichedFollowers,
    following_list: enrichedFollowing,
  })

  // ── 5. Compare with last snapshot ────────────────────────
  if (lastSnapshot) {
    const followersDiff = fresh.followersCount - lastSnapshot.followers_count
    const followingDiff = fresh.followingCount - lastSnapshot.following_count

    const hasChanged =
      followersDiff !== 0 ||
      followingDiff !== 0 ||
      newFollowers.length > 0 ||
      newFollowing.length > 0

    if (hasChanged) {
      console.log(
        `[SCAN] Change detected for @${username}: ` +
        `followers ${lastSnapshot.followers_count} → ${fresh.followersCount} ` +
        `(${newFollowers.length} new users identified), ` +
        `following ${lastSnapshot.following_count} → ${fresh.followingCount} ` +
        `(${newFollowing.length} new users identified)`
      )

      // ── 6. Save change record ──────────────────────────
      await saveChange({
        tracked_profile_id: profileId,
        instagram_username: username,
        followers_before: lastSnapshot.followers_count,
        followers_after: fresh.followersCount,
        followers_diff: followersDiff,
        following_before: lastSnapshot.following_count,
        following_after: fresh.followingCount,
        following_diff: followingDiff,
        new_followers: newFollowers,
        new_following: newFollowing,
        notification_sent: false,
      })

      // ── 6. Send push notification ──────────────────────
      const user = await getUserById(userId)
      if (user?.fcm_token) {
        // Follower change notification (always send if followers changed)
        if (followersDiff !== 0 || newFollowers.length > 0) {
          const { title, body } = buildFollowerNotification(
            username,
            newFollowers,
            fresh.isPrivate,
            followersDiff
          )
          await sendPushNotification(user.fcm_token, title, body, {
            type: 'follower_change',
            username,
            profileId,
          })
        }

        // Following change notification
        if (followingDiff !== 0 || newFollowing.length > 0) {
          const notification = buildFollowingNotification(
            username,
            newFollowing,
            fresh.isPrivate,
            followingDiff
          )
          if (notification) {
            await sendPushNotification(user.fcm_token, notification.title, notification.body, {
              type: 'following_change',
              username,
              profileId,
            })
          }
        }
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

  // Random offset (0–30 min) to avoid thundering herd
  const randomOffsetMs = Math.floor(Math.random() * 30 * 60 * 1000)
  nextScanAt.setTime(nextScanAt.getTime() + randomOffsetMs)

  await updateAfterScan(profileId, fresh.igUserId, nextScanAt)

  console.log(`[SCAN] Done @${username} — next scan at ${nextScanAt.toISOString()}`)
}
