import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { config } from './config'
import { usersRoute } from './routes/users.route'
import { profilesRoute } from './routes/profiles.route'
import { subscriptionsRoute } from './routes/subscriptions.route'

const app = Fastify({ logger: true })

// ─── API key auth ──────────────────────────────────────────
app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return
  const key = req.headers['x-api-key']
  if (!key || key !== config.server.apiKey) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
})

// ─── Health check ──────────────────────────────────────────
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}))

// ─── Routes ────────────────────────────────────────────────
app.register(usersRoute)
app.register(profilesRoute)
app.register(subscriptionsRoute)

// ─── Global error handler ──────────────────────────────────
app.setErrorHandler((err, req, reply) => {
  console.error('[ERROR]', err?.message, req.url)
  reply.status(500).send({ error: 'Internal server error' })
})

// ─── Start ─────────────────────────────────────────────────
const start = async () => {
  try {
    await app.register(rateLimit, { global: false })
    await app.listen({ port: config.server.port, host: '0.0.0.0' })
    console.log(`[SERVER] Running on port ${config.server.port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
