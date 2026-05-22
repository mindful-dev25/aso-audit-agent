import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { itunesSearchUrl, itunesLookupUrl } from '@/lib/app-store'

export const CompetitorSchema = z.object({
  appId: z.string(),
  appName: z.string(),
  developer: z.string(),
  iconUrl: z.string(),
  category: z.string(),
  rating: z.number(),
  ratingCount: z.number(),
  price: z.number(),
  isFree: z.boolean(),
  screenshotCount: z.number(),
  description: z.string(),
})

export type Competitor = z.infer<typeof CompetitorSchema>

export const findCompetitors = createTool({
  id: 'find-competitors',
  description:
    'Searches the iTunes Search API for the top competing apps in the same category. Returns up to 3 competitors with their metadata for side-by-side ASO comparison.',
  inputSchema: z.object({
    category: z.string().describe('Primary app category, e.g. "Music" or "Productivity"'),
    country: z.string().describe('Two-letter country code, e.g. "us"'),
    excludeAppId: z.string().describe('App ID to exclude from results (the app being audited)'),
  }),
  outputSchema: z.object({
    competitors: z.array(CompetitorSchema),
    searchTerm: z.string(),
  }),
  execute: async ({ context: inputData }) => {
    const { category, country, excludeAppId } = inputData

    // Search by category name — returns top results by popularity
    const searchUrl = itunesSearchUrl(category, country, 10)

    let searchResults: unknown[] = []
    try {
      const res = await fetch(searchUrl)
      if (res.ok) {
        const data = (await res.json()) as { results?: unknown[] }
        searchResults = data.results ?? []
      }
    } catch {
      return { competitors: [], searchTerm: category }
    }

    // Filter out the target app and deduplicate by ID
    const seen = new Set<string>([excludeAppId])
    const candidateIds: string[] = []

    for (const item of searchResults) {
      if (typeof item !== 'object' || item === null) continue
      const id = String((item as Record<string, unknown>).trackId ?? '')
      if (id && !seen.has(id)) {
        seen.add(id)
        candidateIds.push(id)
      }
      if (candidateIds.length >= 3) break
    }

    if (candidateIds.length === 0) {
      return { competitors: [], searchTerm: category }
    }

    // Fetch full details for each competitor in parallel
    const competitors = await Promise.all(candidateIds.map((id) => fetchCompetitorDetail(id, country)))

    return {
      competitors: competitors.filter((c): c is Competitor => c !== null),
      searchTerm: category,
    }
  },
})

async function fetchCompetitorDetail(appId: string, country: string): Promise<Competitor | null> {
  try {
    const res = await fetch(itunesLookupUrl(appId, country))
    if (!res.ok) return null

    const data = (await res.json()) as { results?: Record<string, unknown>[] }
    if (!data.results || data.results.length === 0) return null

    const app = data.results[0]
    const screenshots = Array.isArray(app.screenshotUrls) ? (app.screenshotUrls as string[]) : []
    const ipadScreenshots = Array.isArray(app.ipadScreenshotUrls) ? (app.ipadScreenshotUrls as string[]) : []

    return {
      appId: String(app.trackId ?? appId),
      appName: String(app.trackName ?? ''),
      developer: String(app.artistName ?? ''),
      iconUrl: String(app.artworkUrl512 ?? app.artworkUrl100 ?? ''),
      category: String(app.primaryGenreName ?? ''),
      rating: Number(app.averageUserRating ?? 0),
      ratingCount: Number(app.userRatingCount ?? 0),
      price: Number(app.price ?? 0),
      isFree: Number(app.price ?? 0) === 0,
      screenshotCount: screenshots.length + ipadScreenshots.length,
      description: String(app.description ?? '').slice(0, 500),
    }
  } catch {
    return null
  }
}
