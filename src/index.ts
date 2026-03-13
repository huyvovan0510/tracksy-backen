import Fastify from 'fastify'
import { config } from './config'

const app = Fastify({ logger: true })

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

const start = async () => {
  try {
    await app.listen({ port: config.server.port, host: '0.0.0.0' })
    console.log(`Server running on port ${config.server.port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
