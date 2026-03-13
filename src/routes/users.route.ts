import { FastifyInstance } from 'fastify'
import { upsertUser, getUserById, updateFcmToken } from '../supabase/db'

export async function usersRoute(app: FastifyInstance) {
  // Register or update anonymous user
  // Called when app launches with device UUID
  app.post('/users/register', async (req, reply) => {
    const { id, fcm_token } = req.body as { id: string; fcm_token?: string }

    if (!id) return reply.status(400).send({ error: 'id is required' })

    const user = await upsertUser(id, fcm_token)
    return reply.status(200).send({ user })
  })

  // Get user plan info
  app.get('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const user = await getUserById(id)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    return reply.send({ user })
  })

  // Update FCM token (called when notification token refreshes on device)
  app.patch('/users/:id/fcm-token', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { fcm_token } = req.body as { fcm_token: string }

    if (!fcm_token) return reply.status(400).send({ error: 'fcm_token is required' })

    await updateFcmToken(id, fcm_token)
    return reply.send({ success: true })
  })
}
