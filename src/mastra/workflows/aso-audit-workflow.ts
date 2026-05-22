import { createWorkflow, createStep } from '@mastra/core/workflows'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { AppMetadataSchema } from '../tools/fetch-app-metadata'
import { CompetitorSchema } from '../tools/find-competitors'
import { itunesReviewsUrl, itunesSearchUrl, itunesLookupUrl } from '@/lib/app-store'

// ─── Shared schemas ────────────────────────────────────────────────────────

const RecommendationSchema = z.object({
  title: z.string(),
  evidence: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
})

export const AuditResultSchema = z.object({
  appName: z.string(),
  overallScore: z.number(),
  dimensions: z.array(
    z.object({
      name: z.string(),
      score: z.number(),
      weight: z.number(),
      findings: z.string(),
      recommendations: z.array(z.string()),
    })
  ),
  quickWins: z.array(RecommendationSchema),
  highImpactChanges: z.array(RecommendationSchema),
  strategicRecommendations: z.array(RecommendationSchema),
  competitors: z.array(
    z.object({
      name: z.string(),
      rating: z.number(),
      ratingCount: z.number(),
      keyDifference: z.string(),
    })
  ),
})

export type AuditResult = z.infer<typeof AuditResultSchema>

const WorkflowInputSchema = z.object({
  appId: z.string(),
  appUrl: z.string(),
  country: z.string(),
  category: z.string(),
  appMetadata: AppMetadataSchema,
})

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>

const CollectedDataSchema = z.object({
  appMetadata: AppMetadataSchema,
  appUrl: z.string(),
  listing: z.object({
    subtitle: z.string(),
    promotionalText: z.string(),
    hasFirecrawl: z.boolean(),
  }),
  reviews: z.object({
    totalFetched: z.number(),
    averageRating: z.number(),
    ratingDistribution: z.record(z.string(), z.number()),
    recentTrend: z.enum(['improving', 'declining', 'stable', 'insufficient_data']),
    positiveThemes: z.array(z.string()),
    negativeThemes: z.array(z.string()),
  }),
  competitors: z.array(CompetitorSchema),
})

// ─── Step 1: collect all data in parallel ──────────────────────────────────

const collectDataStep = createStep({
  id: 'collect-data',
  inputSchema: WorkflowInputSchema,
  outputSchema: CollectedDataSchema,
  execute: async ({ inputData }) => {
    const { appId, appUrl, country, category } = inputData

    const [listing, reviews, competitors] = await Promise.all([
      scrapeListingData(appUrl),
      fetchReviewsData(appId, country),
      findCompetitorsData(category, country, appId),
    ])

    return {
      appMetadata: inputData.appMetadata,
      appUrl,
      listing,
      reviews,
      competitors,
    }
  },
})

// ─── Step 2: run the LLM audit ─────────────────────────────────────────────

const analyzeAuditStep = createStep({
  id: 'analyze-audit',
  inputSchema: CollectedDataSchema,
  outputSchema: AuditResultSchema,
  execute: async ({ inputData }) => {
    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic('claude-sonnet-4-5')
      : openai('gpt-4o-mini')

    const prompt = buildAuditPrompt(inputData)

    const { object } = await generateObject({
      model,
      schema: AuditResultSchema,
      prompt,
      temperature: 0.3,
    })

    return object
  },
})

// ─── Workflow ───────────────────────────────────────────────────────────────

export const asoAuditWorkflow = createWorkflow({
  id: 'aso-audit-workflow',
  inputSchema: WorkflowInputSchema,
  outputSchema: AuditResultSchema,
})
  .then(collectDataStep)
  .then(analyzeAuditStep)
  .commit()

// ─── Data collection helpers ────────────────────────────────────────────────

async function scrapeListingData(url: string) {
  if (!process.env.FIRECRAWL_API_KEY) {
    return { subtitle: '', promotionalText: '', hasFirecrawl: false }
  }
  try {
    const { default: FirecrawlApp } = await import('@mendable/firecrawl-js')
    const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
    const result = await firecrawl.scrape(url, { formats: ['markdown'] })
    const markdown = result.markdown ?? ''
    return {
      subtitle: extractSubtitle(markdown),
      promotionalText: extractPromotionalText(markdown),
      hasFirecrawl: true,
    }
  } catch {
    return { subtitle: '', promotionalText: '', hasFirecrawl: true }
  }
}

async function fetchReviewsData(appId: string, country: string) {
  const empty = {
    totalFetched: 0,
    averageRating: 0,
    ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    recentTrend: 'insufficient_data' as const,
    positiveThemes: [] as string[],
    negativeThemes: [] as string[],
  }
  try {
    const res = await fetch(itunesReviewsUrl(appId, country))
    if (!res.ok) return empty

    const data = (await res.json()) as { feed?: { entry?: unknown[] } }
    const allEntries = data.feed?.entry ?? []
    const entries = allEntries.slice(1) // first entry is app metadata, not a review

    if (entries.length === 0) return empty

    const reviews = entries.map(parseReviewEntry).filter((r): r is ParsedReview => r !== null)

    const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    let sum = 0
    for (const r of reviews) {
      const k = String(Math.min(5, Math.max(1, Math.round(r.rating))))
      dist[k] = (dist[k] ?? 0) + 1
      sum += r.rating
    }

    return {
      totalFetched: reviews.length,
      averageRating: reviews.length ? Math.round((sum / reviews.length) * 10) / 10 : 0,
      ratingDistribution: dist,
      recentTrend: calcTrend(reviews),
      ...extractThemes(reviews),
    }
  } catch {
    return empty
  }
}

async function findCompetitorsData(category: string, country: string, excludeAppId: string) {
  try {
    const res = await fetch(itunesSearchUrl(category, country, 10))
    if (!res.ok) return []

    const data = (await res.json()) as { results?: Record<string, unknown>[] }
    const seen = new Set([excludeAppId])
    const ids: string[] = []

    for (const item of data.results ?? []) {
      const id = String(item.trackId ?? '')
      if (id && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
      if (ids.length >= 3) break
    }

    const results = await Promise.all(ids.map((id) => fetchCompetitorDetail(id, country)))
    return results.filter((c): c is z.infer<typeof CompetitorSchema> => c !== null)
  } catch {
    return []
  }
}

async function fetchCompetitorDetail(appId: string, country: string) {
  try {
    const res = await fetch(itunesLookupUrl(appId, country))
    if (!res.ok) return null
    const data = (await res.json()) as { results?: Record<string, unknown>[] }
    const app = data.results?.[0]
    if (!app) return null
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

// ─── Prompt builder ─────────────────────────────────────────────────────────

function buildAuditPrompt(data: z.infer<typeof CollectedDataSchema>): string {
  const { appMetadata, listing, reviews, competitors } = data
  const screenshotCount = appMetadata.screenshotUrls.length + appMetadata.ipadScreenshotUrls.length

  return `You are an expert in App Store Optimization with deep knowledge of Apple's ranking algorithms.
Perform a comprehensive ASO health audit and produce a prioritized action plan.

Score the listing on each dimension below on a 0–10 scale. The weighted sum is the overall ASO Score out of 100.

Dimension             | Weight | Key checks
----------------------|--------|----------------------------------------------------------
Title (30 char)       |  20%   | Primary keyword present? Character utilization? Brand vs. keyword balance? Natural reading, not stuffed?
Subtitle (30 char)    |  15%   | Distinct secondary keywords (not repeating title)? Benefit-driven? Full character utilization?
Keyword field (100c)  |  15%   | No duplicates with title/subtitle? Singular forms? No spaces after commas? No wasted words ("app", category names, brand)? Full 100 chars used?
Description           |  10%   | First 3 lines hook above the "more" cutoff? Features benefit-framed? Social proof? Clear CTA? Natural keyword integration?
Screenshots           |  15%   | All 10 slots used? First 2–3 communicate value? Readable on-image text (Apple OCR-indexes it)? Cohesive design language?
App preview video     |   5%   | Exists? Hook in first 3 seconds? 15–30 seconds? Works without sound?
Ratings & reviews     |  15%   | Average rating? Recent trend? Themes in praise and complaints? Developer responds to negatives?
Icon                  |   5%   | Distinctive in search results? Clear at small sizes? Category-appropriate? Avoids unreadable text?
Conversion signals    |   5%   | Promotional text used? "What's New" informative? In-App Events? Custom product pages?
Competitive position  |   5%   | Keyword coverage vs. top 3 competitors? Visual style? Rating gap?

Rules:
- For every recommendation, cite the specific data point as evidence.
- For any text-based change (title, subtitle, description), include before/after examples where the current text is known.
- Be specific: "rewrite the title from 'X' to 'Y' because Z" beats "improve the title."
- Quick Wins = 3–5 high-impact changes implementable today.
- High-Impact Changes = 3–5 changes requiring more effort.
- Strategic Recommendations = 3–5 longer-term improvements.

--- APP DATA ---

App Name: ${appMetadata.appName}
Developer: ${appMetadata.developer}
Category: ${appMetadata.category}
Price: ${appMetadata.isFree ? 'Free' : `$${appMetadata.price}`}
Version: ${appMetadata.version}
Content Rating: ${appMetadata.contentRating}

TITLE: "${appMetadata.appName}"
SUBTITLE: "${listing.subtitle || '(not available — Firecrawl not configured)'}"
PROMOTIONAL TEXT: "${listing.promotionalText || '(not available)'}"
KEYWORD FIELD: "(not public — analyze indirectly from title/subtitle)"

DESCRIPTION (first 500 chars):
${appMetadata.description.slice(0, 500)}

WHAT'S NEW:
${appMetadata.releaseNotes || '(none)'}

SCREENSHOTS: ${screenshotCount} total (${appMetadata.screenshotUrls.length} iPhone, ${appMetadata.ipadScreenshotUrls.length} iPad)
APP PREVIEW VIDEO: unknown (not available via public API)

RATINGS:
- Overall rating: ${appMetadata.rating}/5 (${appMetadata.ratingCount.toLocaleString()} ratings)
- Recent reviews fetched: ${reviews.totalFetched}
- Recent average from RSS: ${reviews.averageRating}/5
- Trend: ${reviews.recentTrend}
- Rating distribution: ${JSON.stringify(reviews.ratingDistribution)}
- Top praise themes: ${reviews.positiveThemes.join(', ') || 'none detected'}
- Top complaint themes: ${reviews.negativeThemes.join(', ') || 'none detected'}

TOP COMPETITORS:
${
  competitors.length === 0
    ? 'No competitors found.'
    : competitors
        .map(
          (c, i) =>
            `${i + 1}. ${c.appName} by ${c.developer} — ${c.rating}/5 (${c.ratingCount.toLocaleString()} ratings), ${c.isFree ? 'Free' : `$${c.price}`}, ${c.screenshotCount} screenshots`
        )
        .join('\n')
}
${listing.hasFirecrawl ? '' : '\nNote: Firecrawl was not configured — subtitle, promotional text, and keyword field analysis is based on available data only.'}

Now produce the full ASO audit JSON.`
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type ParsedReview = { rating: number; text: string }

function parseReviewEntry(entry: unknown): ParsedReview | null {
  if (typeof entry !== 'object' || entry === null) return null
  const e = entry as Record<string, unknown>
  const rating = Number(getLabel(e['im:rating']))
  if (isNaN(rating)) return null
  return { rating, text: getLabel(e['content']) }
}

function getLabel(node: unknown): string {
  if (typeof node === 'object' && node !== null) {
    return String((node as Record<string, unknown>).label ?? '')
  }
  return ''
}

function calcTrend(reviews: ParsedReview[]): 'improving' | 'declining' | 'stable' | 'insufficient_data' {
  if (reviews.length < 10) return 'insufficient_data'
  const mid = Math.floor(reviews.length / 2)
  const recent = reviews.slice(0, mid).reduce((s, r) => s + r.rating, 0) / mid
  const older = reviews.slice(mid).reduce((s, r) => s + r.rating, 0) / (reviews.length - mid)
  if (recent - older > 0.3) return 'improving'
  if (older - recent > 0.3) return 'declining'
  return 'stable'
}

const POSITIVE_KW: Record<string, string> = {
  'easy to use': 'ease of use', intuitive: 'intuitive UI', fast: 'performance',
  love: 'user delight', amazing: 'user delight', helpful: 'helpfulness',
  'works great': 'reliability', offline: 'offline support',
}
const NEGATIVE_KW: Record<string, string> = {
  crash: 'crashes/stability', bug: 'bugs', slow: 'performance',
  expensive: 'pricing', subscription: 'subscription model', ads: 'ads',
  battery: 'battery drain', 'not working': 'reliability', login: 'login issues',
}

function extractThemes(reviews: ParsedReview[]) {
  const pos: Record<string, number> = {}
  const neg: Record<string, number> = {}
  for (const r of reviews) {
    const text = r.text.toLowerCase()
    const kws = r.rating >= 4 ? POSITIVE_KW : NEGATIVE_KW
    const counter = r.rating >= 4 ? pos : neg
    for (const [kw, theme] of Object.entries(kws)) {
      if (text.includes(kw)) counter[theme] = (counter[theme] ?? 0) + 1
    }
  }
  const top = (c: Record<string, number>) =>
    Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
  return { positiveThemes: top(pos), negativeThemes: top(neg) }
}

function extractSubtitle(markdown: string): string {
  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean)
  const titleIdx = lines.findIndex((l) => l.startsWith('#'))
  if (titleIdx === -1) return ''
  for (let i = titleIdx + 1; i < Math.min(titleIdx + 5, lines.length); i++) {
    const line = lines[i]
    if (line.startsWith('#')) break
    if (line.length <= 50 && !/^\d|^by\s|rating|review/i.test(line)) return line
  }
  return ''
}

function extractPromotionalText(markdown: string): string {
  const m = markdown.match(/promotional text[:\s\n]+([^\n]{10,170})/i)
  return m ? m[1].trim() : ''
}
