import { Queue, Worker } from 'bullmq'
import { config } from '../config'
import { processScanJob, ScanJobData } from './scan.job'
import { TrackedProfile } from '../types'

// ─── Redis connection ──────────────────────────────────────
// Pass URL directly to BullMQ — avoids ioredis version conflict
const connection = {
  url: config.redis.url,
  maxRetriesPerRequest: null, // required by BullMQ
  tls: config.redis.url.startsWith('rediss') ? {} : undefined,
}

// ─── Queue ────────────────────────────────────────────────
export const scanQueue = new Queue<ScanJobData>('profile-scans', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

// ─── Worker ───────────────────────────────────────────────
export function startWorker() {
  const worker = new Worker<ScanJobData>(
    'profile-scans',
    processScanJob,
    {
      connection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 3000,
      },
    }
  )

  worker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} completed — @${job.data.trackedProfile.instagram_username}`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job?.id} failed — ${err.message}`)
  })

  console.log('[WORKER] Scan worker started')
  return worker
}

// ─── Schedule a profile scan ───────────────────────────────
export async function enqueueScan(profile: TrackedProfile, userId: string, delayMs = 0) {
  await scanQueue.add(
    `scan:${profile.instagram_username}`,
    { trackedProfile: profile, userId },
    { delay: delayMs }
  )
  console.log(`[QUEUE] Enqueued scan for @${profile.instagram_username} (delay: ${delayMs}ms)`)
}
