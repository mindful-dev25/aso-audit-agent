import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { itunesReviewsUrl } from '@/lib/app-store'

const ReviewSchema = z.object({
  id: z.string(),
  author: z.string(),
  rating: z.number(),
  title: z.string(),
  text: z.string(),
  date: z.string(),
})

export type Review = z.infer<typeof ReviewSchema>

export const fetchAppReviews = createTool({
  id: 'fetch-app-reviews',
  description:
    'Fetches the most recent App Store customer reviews via the iTunes RSS feed (free, no API key required). Returns up to 50 reviews with ratings, text, and derived sentiment themes.',
  inputSchema: z.object({
    appId: z.string().describe('Numeric iTunes app ID'),
    country: z.string().describe('Two-letter country code, e.g. "us"'),
  }),
  outputSchema: z.object({
    reviews: z.array(ReviewSchema),
    totalFetched: z.number(),
    averageRating: z.number(),
    ratingDistribution: z.record(z.string(), z.number()),
    recentTrend: z.enum(['improving', 'declining', 'stable', 'insufficient_data']),
    positiveThemes: z.array(z.string()),
    negativeThemes: z.array(z.string()),
    developerResponseRate: z.string(),
  }),
  execute: async (inputData) => {
    const { appId, country } = inputData

    let data: unknown
    try {
      const res = await fetch(itunesReviewsUrl(appId, country))
      if (!res.ok) {
        return emptyResult()
      }
      data = await res.json()
    } catch {
      return emptyResult()
    }

    const entries = extractEntries(data)
    if (entries.length === 0) return emptyResult()

    const reviews = entries.map(parseEntry).filter((r): r is Review => r !== null)

    const ratingDistribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    let ratingSum = 0
    for (const r of reviews) {
      const key = String(Math.min(5, Math.max(1, Math.round(r.rating)))) as keyof typeof ratingDistribution
      ratingDistribution[key] = (ratingDistribution[key] ?? 0) + 1
      ratingSum += r.rating
    }

    const averageRating = reviews.length > 0 ? ratingSum / reviews.length : 0
    const recentTrend = calcTrend(reviews)
    const { positiveThemes, negativeThemes } = extractThemes(reviews)

    return {
      reviews: reviews.slice(0, 50),
      totalFetched: reviews.length,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution,
      recentTrend,
      positiveThemes,
      negativeThemes,
      developerResponseRate: 'unavailable via RSS',
    }
  },
})

// The iTunes RSS JSON feed nests entries under feed.entry.
// The first entry is app metadata (not a review) — skip it.
function extractEntries(data: unknown): unknown[] {
  if (typeof data !== 'object' || data === null) return []
  const feed = (data as Record<string, unknown>).feed
  if (typeof feed !== 'object' || feed === null) return []
  const entry = (feed as Record<string, unknown>).entry
  if (!Array.isArray(entry) || entry.length === 0) return []
  // First entry is app info, not a review
  return entry.slice(1)
}

function parseEntry(entry: unknown): Review | null {
  if (typeof entry !== 'object' || entry === null) return null
  const e = entry as Record<string, unknown>

  const rating = Number(getLabel(e['im:rating']))
  if (isNaN(rating)) return null

  return {
    id: getLabel(e['id']) || String(Math.random()),
    author: getNestedLabel(e['author'], 'name'),
    rating,
    title: getLabel(e['title']),
    text: getLabel(e['content']),
    date: getLabel(e['updated']),
  }
}

function getLabel(node: unknown): string {
  if (typeof node === 'object' && node !== null) {
    return String((node as Record<string, unknown>).label ?? '')
  }
  return ''
}

function getNestedLabel(node: unknown, key: string): string {
  if (typeof node === 'object' && node !== null) {
    return getLabel((node as Record<string, unknown>)[key])
  }
  return ''
}

// Compare average rating of the oldest half vs newest half to detect trend.
function calcTrend(reviews: Review[]): 'improving' | 'declining' | 'stable' | 'insufficient_data' {
  if (reviews.length < 10) return 'insufficient_data'
  const mid = Math.floor(reviews.length / 2)
  // reviews are newest-first from RSS
  const recentAvg = avg(reviews.slice(0, mid).map((r) => r.rating))
  const olderAvg = avg(reviews.slice(mid).map((r) => r.rating))
  const delta = recentAvg - olderAvg
  if (delta > 0.3) return 'improving'
  if (delta < -0.3) return 'declining'
  return 'stable'
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}

// Keyword frequency scan to surface the most common praise/complaint topics.
const POSITIVE_KEYWORDS: Record<string, string> = {
  'easy to use': 'ease of use',
  'intuitive': 'intuitive UI',
  'great design': 'design quality',
  'fast': 'performance',
  'love': 'user delight',
  'helpful': 'helpfulness',
  'amazing': 'user delight',
  'works great': 'reliability',
  'offline': 'offline support',
}

const NEGATIVE_KEYWORDS: Record<string, string> = {
  'crash': 'crashes/stability',
  'bug': 'bugs',
  'slow': 'performance',
  'expensive': 'pricing',
  'subscription': 'subscription model',
  'ads': 'ads',
  'battery': 'battery drain',
  'update': 'update issues',
  'login': 'login/auth issues',
  'not working': 'reliability',
}

function extractThemes(reviews: Review[]): { positiveThemes: string[]; negativeThemes: string[] } {
  const positiveCount: Record<string, number> = {}
  const negativeCount: Record<string, number> = {}

  for (const review of reviews) {
    const text = review.text.toLowerCase()
    const dict = review.rating >= 4 ? POSITIVE_KEYWORDS : NEGATIVE_KEYWORDS
    const counter = review.rating >= 4 ? positiveCount : negativeCount

    for (const [kw, theme] of Object.entries(dict)) {
      if (text.includes(kw)) {
        counter[theme] = (counter[theme] ?? 0) + 1
      }
    }
  }

  const topPositive = Object.entries(positiveCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme]) => theme)

  const topNegative = Object.entries(negativeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme]) => theme)

  return { positiveThemes: topPositive, negativeThemes: topNegative }
}

function emptyResult() {
  return {
    reviews: [],
    totalFetched: 0,
    averageRating: 0,
    ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    recentTrend: 'insufficient_data' as const,
    positiveThemes: [],
    negativeThemes: [],
    developerResponseRate: 'unavailable via RSS',
  }
}
