import { Queue, Worker, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import { config } from '../config'
import { processScanJob, ScanJobData } from './scan.job'
import { TrackedProfile } from '../types'

// ─── Redis connection ──────────────────────────────────────
const connection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null, // required by BullMQ
  tls: config.redis.url.startsWith('rediss') ? {} : undefined,
})

// ─── Queue ────────────────────────────────────────────────
export const scanQueue = new Queue<ScanJobData>('profile-scans', {
  connection,
  defaultJobOptions: {
    attempts: 3,                          // retry up to 3 times on failure
    backoff: { type: 'exponential', delay: 5000 }, // wait longer between retries
    removeOnComplete: 100,                // keep last 100 completed jobs for debugging
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
      concurrency: 1,       // one scan at a time
      limiter: {
        max: 1,
        duration: 3000,     // 1 job per 3 seconds max
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
