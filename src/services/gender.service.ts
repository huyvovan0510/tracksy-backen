// eslint-disable-next-line @typescript-eslint/no-require-imports
const unidecode = require('unidecode')

// ─── Cache: name → gender (persists for lifetime of process) ──
const cache = new Map<string, 'male' | 'female' | 'unknown'>()

// Minimum confidence to trust the result
const MIN_CONFIDENCE = 0.6

// Max names per genderize.io batch request
const BATCH_SIZE = 10

interface GenderizeResult {
  name: string
  gender: 'male' | 'female' | null
  probability: number
  count: number
}

// Normalize fancy Unicode text to ASCII (e.g. "𝙏𝙝𝙪" → "Thu")
function normalizeName(raw: string): string {
  return unidecode(raw).trim()
}

// Extract the best candidate name from a full name string
// Tries last word first (works for Vietnamese), then first word
function extractCandidateNames(fullName: string): string[] {
  const normalized = normalizeName(fullName)
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  if (words.length === 1) return [words[0]]
  // Last word first (Vietnamese given name), then first word (Western given name)
  return [words[words.length - 1], words[0]]
}

// Query genderize.io for a batch of names (max 10)
async function queryGenderize(names: string[]): Promise<Map<string, 'male' | 'female' | 'unknown'>> {
  const result = new Map<string, 'male' | 'female' | 'unknown'>()
  if (names.length === 0) return result

  const params = names.map(n => `name[]=${encodeURIComponent(n)}`).join('&')
  const url = `https://api.genderize.io?${params}`

  try {
    const res = await fetch(url)
    if (!res.ok) return result

    const data = await res.json() as GenderizeResult[]
    for (const item of data) {
      const gender: 'male' | 'female' | 'unknown' =
        item.gender && item.probability >= MIN_CONFIDENCE
          ? item.gender
          : 'unknown'
      result.set(item.name.toLowerCase(), gender)
    }
  } catch {
    // network error — return empty, callers fall back to 'unknown'
  }

  return result
}

// ─── Main export ───────────────────────────────────────────
// Detects gender for a list of full names using genderize.io
// Returns a parallel array of genders in the same order as input
export async function detectGenderBatch(fullNames: string[]): Promise<('male' | 'female' | 'unknown')[]> {
  // Build candidate name per input (best guess at given name)
  const candidates = fullNames.map(name => {
    const parts = extractCandidateNames(name)
    return parts[0]?.toLowerCase() ?? ''
  })

  // Find names not in cache
  const uncached = [...new Set(candidates.filter(n => n && !cache.has(n)))]

  // Batch query genderize.io for uncached names
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE)
    const results = await queryGenderize(batch)

    for (const [name, gender] of results) {
      cache.set(name, gender)
    }

    // Mark any name genderize didn't return as unknown
    for (const name of batch) {
      if (!cache.has(name)) cache.set(name, 'unknown')
    }
  }

  // Return results in original order
  return candidates.map(candidate => {
    if (!candidate) return 'unknown'
    return cache.get(candidate) ?? 'unknown'
  })
}
