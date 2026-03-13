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
    accounts: JSON.parse(process.env.IG_ACCOUNTS || '[]'),
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
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
