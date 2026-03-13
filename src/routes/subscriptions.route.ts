import { FastifyInstance } from 'fastify'
import { getUserById, updateUserPlan } from '../supabase/db'

// Subscription verification will be fully implemented in Step 7
// For now this sets up the route structure

export async function subscriptionsRoute(app: FastifyInstance) {

  // Verify subscription receipt from App Store or Google Play
  // Called after user completes purchase on device
  app.post('/users/:userId/subscription/verify', async (req, reply) => {
    const { userId } = req.params as { userId: string }
    const { platform, product_id, receipt_data, purchase_token } = req.body as {
      platform: 'ios' | 'android'
      product_id: string
      receipt_data?: string    // iOS
      purchase_token?: string  // Android
    }

    const user = await getUserById(userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // TODO: verify receipt with Apple/Google in Step 7
    // For now, trust the client (development only)
    await updateUserPlan(userId, 'pro')

    return reply.send({
      success: true,
      plan: 'pro',
      message: 'Subscription activated',
    })
  })

  // Downgrade user back to free (called on subscription expiry)
  app.post('/users/:userId/subscription/cancel', async (req, reply) => {
    const { userId } = req.params as { userId: string }

    const user = await getUserById(userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    await updateUserPlan(userId, 'free')
    return reply.send({ success: true, plan: 'free' })
  })
}
