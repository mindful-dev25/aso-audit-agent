import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { itunesReviewsUrl } from '@/lib/app-store'
import { getLabel, calcTrend, extractThemes } from '../lib/itunes-helpers'

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

function getNestedLabel(node: unknown, key: string): string {
  if (typeof node === 'object' && node !== null) {
    return getLabel((node as Record<string, unknown>)[key])
  }
  return ''
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
