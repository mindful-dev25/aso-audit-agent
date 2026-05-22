import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { parseAppStoreUrl, itunesLookupUrl } from '@/lib/app-store'

export const AppMetadataSchema = z.object({
  appId: z.string(),
  appName: z.string(),
  developer: z.string(),
  iconUrl: z.string(),
  category: z.string(),
  genres: z.array(z.string()),
  country: z.string(),
  rating: z.number(),
  ratingCount: z.number(),
  description: z.string(),
  screenshotUrls: z.array(z.string()),
  ipadScreenshotUrls: z.array(z.string()),
  price: z.number(),
  isFree: z.boolean(),
  version: z.string(),
  releaseNotes: z.string(),
  appUrl: z.string(),
  contentRating: z.string(),
  minimumOsVersion: z.string(),
})

export type AppMetadata = z.infer<typeof AppMetadataSchema>

export const fetchAppMetadata = createTool({
  id: 'fetch-app-metadata',
  description:
    'Fetches structured metadata for an iOS app from the Apple iTunes Lookup API given an App Store URL. Use this first whenever the user shares an App Store link.',
  inputSchema: z.object({
    url: z.string().describe('Apple App Store URL, e.g. https://apps.apple.com/us/app/spotify/id324684580'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    metadata: AppMetadataSchema.nullable(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { url } = inputData

    const parts = parseAppStoreUrl(url)
    if (!parts) {
      return { found: false, metadata: null, error: 'Not a valid App Store URL — could not extract app ID.' }
    }

    let res: Response
    try {
      res = await fetch(itunesLookupUrl(parts.appId, parts.country))
    } catch (err) {
      return { found: false, metadata: null, error: `Network error: ${String(err)}` }
    }

    if (!res.ok) {
      return { found: false, metadata: null, error: `iTunes API returned HTTP ${res.status}` }
    }

    const data = (await res.json()) as { resultCount: number; results: Record<string, unknown>[] }

    if (!data.results || data.results.length === 0) {
      return { found: false, metadata: null, error: 'App not found — it may be unavailable in this region.' }
    }

    const app = data.results[0]

    return {
      found: true,
      metadata: {
        appId: String(app.trackId ?? parts.appId),
        appName: String(app.trackName ?? ''),
        developer: String(app.artistName ?? ''),
        iconUrl: String(app.artworkUrl512 ?? app.artworkUrl100 ?? ''),
        category: String(app.primaryGenreName ?? ''),
        genres: Array.isArray(app.genres) ? (app.genres as string[]) : [],
        country: parts.country,
        rating: Number(app.averageUserRating ?? 0),
        ratingCount: Number(app.userRatingCount ?? 0),
        description: String(app.description ?? ''),
        screenshotUrls: Array.isArray(app.screenshotUrls) ? (app.screenshotUrls as string[]) : [],
        ipadScreenshotUrls: Array.isArray(app.ipadScreenshotUrls) ? (app.ipadScreenshotUrls as string[]) : [],
        price: Number(app.price ?? 0),
        isFree: Number(app.price ?? 0) === 0,
        version: String(app.version ?? ''),
        releaseNotes: String(app.releaseNotes ?? ''),
        appUrl: String(app.trackViewUrl ?? url),
        contentRating: String(app.contentAdvisoryRating ?? ''),
        minimumOsVersion: String(app.minimumOsVersion ?? ''),
      },
    }
  },
})
