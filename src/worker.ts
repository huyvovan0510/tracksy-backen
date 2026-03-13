import './config' // load env
import { startWorker } from './jobs/queue'
import { getProfilesDueForScan, getTrackedProfilesByUser } from './supabase/db'
import { enqueueScan } from './jobs/queue'

// ─── Start the worker ─────────────────────────────────────
startWorker()

// ─── Scheduler: every 5 minutes, check for due scans ─────
async function scheduleduScans() {
  try {
    const profiles = await getProfilesDueForScan(50)
    if (profiles.length === 0) return

    console.log(`[SCHEDULER] Found ${profiles.length} profiles due for scan`)

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i]
      const delayMs = i * 3000 // stagger by 3 seconds each
      await enqueueScan(profile, profile.user_id, delayMs)
    }
  } catch (err) {
    console.error('[SCHEDULER] Error checking due scans:', err)
  }
}

// Run scheduler every 5 minutes
scheduleduScans() // run immediately on start
setInterval(scheduleduScans, 5 * 60 * 1000)

console.log('[WORKER] Tracksy scan worker running...')
