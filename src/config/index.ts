import dotenv from 'dotenv'
dotenv.config()

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceKey: process.env.SUPABASE_SERVICE_KEY!,
  },
  redis: {
    url: process.env.REDIS_URL!,
  },
  instagram: {
    accounts: (() => {
      try {
        return JSON.parse(process.env.IG_ACCOUNTS || '[]')
      } catch {
        console.error('[CONFIG] IG_ACCOUNTS is not valid JSON — no Instagram accounts loaded')
        return []
      }
    })(),
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    apiKey: process.env.API_KEY || '',
  },
  plans: {
    free: {
      maxTrackedProfiles: 0,   // free users cannot track
      scanIntervalHours: 0,
    },
    pro: {
      maxTrackedProfiles: 20,
      scanIntervalHours: 6,
    },
  },
}
