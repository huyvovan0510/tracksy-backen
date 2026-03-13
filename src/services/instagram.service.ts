import { IgApiClient } from 'instagram-private-api'
import { config } from '../config'
import { IgAccount } from '../types'
import fs from 'fs'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const genderDetection = require('gender-detection')

interface IgUser {
  pk: string
  username: string
  fullName: string
  profilePicUrl: string
  gender: 'male' | 'female' | 'unknown'
}

interface ProfileData {
  igUserId: string
  username: string
  fullName: string
  bio: string
  profilePicUrl: string
  followersCount: number
  followingCount: number
  isPrivate: boolean
  isVerified: boolean
  followers: IgUser[]
  following: IgUser[]
  relatedAccounts: IgUser[]
}

// ─── Session persistence ────────────────────────────────────
const SESSION_DIR = path.resolve(process.cwd(), 'sessions')
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR)

function sessionPath(username: string) {
  return path.join(SESSION_DIR, `${username}.json`)
}

function saveSession(username: string, state: object) {
  fs.writeFileSync(sessionPath(username), JSON.stringify(state))
}

function loadSession(username: string): object | null {
  const file = sessionPath(username)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// ─── Account Pool ──────────────────────────────────────────
let currentAccountIndex = 0
const accounts: IgAccount[] = config.instagram.accounts

function getNextAccount(): IgAccount {
  if (accounts.length === 0) throw new Error('No Instagram accounts configured')
  const account = accounts[currentAccountIndex]
  currentAccountIndex = (currentAccountIndex + 1) % accounts.length
  return account
}

// ─── Session Cache ─────────────────────────────────────────
const sessionCache = new Map<string, IgApiClient>()

// ─── Keep-alive timers (one per account, prevents memory leak) ─
const keepAliveTimers = new Map<string, NodeJS.Timeout>()

async function getAuthenticatedClient(account: IgAccount): Promise<IgApiClient> {
  if (sessionCache.has(account.username)) {
    return sessionCache.get(account.username)!
  }

  const ig = new IgApiClient()
  ig.state.generateDevice(account.username)

  const saved = loadSession(account.username)
  if (saved) {
    await ig.state.deserialize(saved)
    console.log(`[IG] Restored session for @${account.username}`)
  } else {
    await ig.account.login(account.username, account.password)
    saveSession(account.username, await ig.state.serialize())
    console.log(`[IG] Logged in and saved session for @${account.username}`)
  }

  sessionCache.set(account.username, ig)

  // One keep-alive timer per account — prevent duplicate intervals on cache miss/re-auth
  if (!keepAliveTimers.has(account.username)) {
    const timer = setInterval(async () => {
      try {
        await ig.account.currentUser()
        saveSession(account.username, await ig.state.serialize())
        console.log(`[IG] Session refreshed for @${account.username}`)
      } catch {
        sessionCache.delete(account.username)
        fs.rmSync(sessionPath(account.username), { force: true })
        keepAliveTimers.delete(account.username)
        console.warn(`[IG] Idle session expired for @${account.username}, will re-login on next request`)
      }
    }, 24 * 60 * 60 * 1000)
    keepAliveTimers.set(account.username, timer)
  }

  return ig
}

// ─── Random delay helper ───────────────────────────────────
function randomDelay(minMs = 2000, maxMs = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise(resolve => setTimeout(resolve, ms))
}

function mapUser(u: any): IgUser {
  const firstName = (u.full_name ?? '').split(' ')[0]
  return {
    pk: String(u.pk),
    username: u.username,
    fullName: u.full_name ?? '',
    profilePicUrl: u.profile_pic_url ?? '',
    gender: genderDetection.detect(firstName),
  }
}

// ─── Main fetch function ───────────────────────────────────
export async function fetchProfile(username: string, _retried = false): Promise<ProfileData> {
  const account = getNextAccount()
  const ig = await getAuthenticatedClient(account)

  await randomDelay()

  try {
    const user = await ig.user.usernameinfo(username)
    const userId = user.pk

    let followers: any[] = []
    let following: any[] = []
    let relatedAccounts: any[] = []

    if (!user.is_private) {
      ;[followers, following] = await Promise.all([
        ig.feed.accountFollowers(userId).items().catch(() => []),
        ig.feed.accountFollowing(userId).items().catch(() => []),
      ])
    } else {
      const [chainingRes, sharedRes] = await Promise.all([
        ig.discover.chaining(String(userId)).catch(() => null),
        ig.user.sharedFollowerAccounts(String(userId)).catch(() => null),
      ])
      const chained = chainingRes?.users ?? []
      const shared = sharedRes?.accounts ?? sharedRes?.users ?? []
      relatedAccounts = [...chained, ...shared]
    }

    // Re-save after each use — rotated cookies stay fresh
    saveSession(account.username, await ig.state.serialize())

    return {
      igUserId: String(userId),
      username: user.username,
      fullName: user.full_name ?? '',
      bio: user.biography ?? '',
      profilePicUrl: user.profile_pic_url ?? '',
      followersCount: user.follower_count ?? 0,
      followingCount: user.following_count ?? 0,
      isPrivate: user.is_private ?? false,
      isVerified: user.is_verified ?? false,
      followers: followers.map(mapUser),
      following: following.map(mapUser),
      relatedAccounts: relatedAccounts.map(mapUser),
    }
  } catch (err: any) {
    // Session expired — retry once with fresh login (no infinite recursion)
    if (err?.name === 'IgLoginRequiredError' && !_retried) {
      console.warn(`[IG] Session expired for @${account.username}, re-authenticating...`)
      sessionCache.delete(account.username)
      fs.rmSync(sessionPath(account.username), { force: true })
      return fetchProfile(username, true)
    }
    throw err
  }
}
