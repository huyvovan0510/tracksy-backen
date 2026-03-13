import { FastifyInstance } from 'fastify'
import { fetchProfile } from '../services/instagram.service'
import {
  getUserById,
  getTrackedProfilesByUser,
  addTrackedProfile,
  removeTrackedProfile,
  countTrackedProfiles,
  getSnapshotHistory,
  getProfileChanges,
} from '../supabase/db'
import { enqueueScan } from '../jobs/queue'
import { config } from '../config'

// Instagram usernames: 1-30 chars, alphanumeric + dots + underscores
const IG_USERNAME_REGEX = /^[a-zA-Z0-9._]{1,30}$/

function parseLimit(raw: string | undefined, defaultVal = 30): number {
  const n = parseInt(raw ?? '')
  return isNaN(n) ? defaultVal : Math.max(n, 1)
}

export async function profilesRoute(app: FastifyInstance) {

  // ── Search a profile (free + pro users) ─────────────────
  app.get('/profiles/search', async (req, reply) => {
    const { username } = req.query as { username: string }

    if (!username) return reply.status(400).send({ error: 'username is required' })

    const cleaned = username.toLowerCase().trim()
    if (!IG_USERNAME_REGEX.test(cleaned)) {
      return reply.status(400).send({ error: 'Invalid Instagram username format' })
    }

    try {
      const profile = await fetchProfile(cleaned)
      return reply.send({ profile })
    } catch (err: any) {
      if (err?.name === 'IgNotFoundError') {
        return reply.status(404).send({ error: 'Instagram profile not found' })
      }
      console.error('[SEARCH ERROR]', err?.name, err?.message)
      return reply.status(500).send({ error: 'Failed to fetch profile' })
    }
  })

  // ── Get all tracked profiles for a user ──────────────────
  app.get('/users/:userId/tracked-profiles', async (req, reply) => {
    const { userId } = req.params as { userId: string }

    const user = await getUserById(userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const profiles = await getTrackedProfilesByUser(userId)
    return reply.send({ profiles })
  })

  // ── Add a profile to track (pro only) ───────────────────
  app.post('/users/:userId/tracked-profiles', async (req, reply) => {
    const { userId } = req.params as { userId: string }
    const { username } = req.body as { username: string }

    if (!username) return reply.status(400).send({ error: 'username is required' })

    const cleaned = username.toLowerCase().trim()
    if (!IG_USERNAME_REGEX.test(cleaned)) {
      return reply.status(400).send({ error: 'Invalid Instagram username format' })
    }

    const user = await getUserById(userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })
    if (user.plan !== 'pro') {
      return reply.status(403).send({ error: 'Upgrade to Pro to track profiles' })
    }

    const count = await countTrackedProfiles(userId)
    if (count >= config.plans.pro.maxTrackedProfiles) {
      return reply.status(403).send({
        error: `You have reached the limit of ${config.plans.pro.maxTrackedProfiles} tracked profiles`,
      })
    }

    try {
      const profile = await addTrackedProfile(userId, cleaned)
      await enqueueScan(profile, userId, 0)
      return reply.status(201).send({ profile })
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send({ error: 'You are already tracking this profile' })
      }
      throw err
    }
  })

  // ── Remove a tracked profile ─────────────────────────────
  app.delete('/users/:userId/tracked-profiles/:profileId', async (req, reply) => {
    const { userId, profileId } = req.params as { userId: string; profileId: string }

    await removeTrackedProfile(profileId, userId)
    return reply.send({ success: true })
  })

  // ── Get snapshot history for a tracked profile ───────────
  app.get('/users/:userId/tracked-profiles/:profileId/snapshots', async (req, reply) => {
    const { profileId } = req.params as { userId: string; profileId: string }
    const { limit } = req.query as { limit?: string }

    const snapshots = await getSnapshotHistory(profileId, parseLimit(limit))
    return reply.send({ snapshots })
  })

  // ── Get change history for a tracked profile ─────────────
  app.get('/users/:userId/tracked-profiles/:profileId/changes', async (req, reply) => {
    const { profileId } = req.params as { userId: string; profileId: string }
    const { limit } = req.query as { limit?: string }

    const changes = await getProfileChanges(profileId, parseLimit(limit))
    return reply.send({ changes })
  })
}
