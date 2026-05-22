import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const scrapeAppListing = createTool({
  id: 'scrape-app-listing',
  description:
    'Scrapes the full App Store listing page via Firecrawl to extract the subtitle and promotional text, which are not available from the iTunes API. Returns empty strings gracefully if FIRECRAWL_API_KEY is not set.',
  inputSchema: z.object({
    url: z.string().describe('Apple App Store URL to scrape'),
  }),
  outputSchema: z.object({
    subtitle: z.string(),
    promotionalText: z.string(),
    hasFirecrawl: z.boolean(),
    note: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { url } = inputData

    if (!process.env.FIRECRAWL_API_KEY) {
      return {
        subtitle: '',
        promotionalText: '',
        hasFirecrawl: false,
        note: 'FIRECRAWL_API_KEY not set — subtitle and promotional text analysis skipped.',
      }
    }

    // Dynamic import so the module is only loaded when the key is present
    const { default: FirecrawlApp } = await import('@mendable/firecrawl-js')
    const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })

    let markdown = ''
    try {
      const result = await firecrawl.scrape(url, { formats: ['markdown'] })
      if (result.markdown) {
        markdown = result.markdown
      }
    } catch {
      return { subtitle: '', promotionalText: '', hasFirecrawl: true, note: 'Firecrawl scrape failed.' }
    }

    if (!markdown) {
      return { subtitle: '', promotionalText: '', hasFirecrawl: true }
    }

    const subtitle = extractSubtitle(markdown)
    const promotionalText = extractPromotionalText(markdown)

    return { subtitle, promotionalText, hasFirecrawl: true }
  },
})

// The subtitle on the App Store page is a short tagline (≤30 chars) immediately
// below the app name. In Firecrawl markdown it appears as the first non-heading,
// non-empty line after the title heading.
function extractSubtitle(markdown: string): string {
  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean)
  const titleIdx = lines.findIndex((l) => l.startsWith('#'))
  if (titleIdx === -1) return ''

  for (let i = titleIdx + 1; i < Math.min(titleIdx + 5, lines.length); i++) {
    const line = lines[i]
    if (line.startsWith('#')) break
    // Subtitle is short (≤30 chars per App Store limit) and not a rating/metadata line
    if (line.length <= 50 && !/^\d|^by\s|rating|review/i.test(line)) {
      return line
    }
  }
  return ''
}

// Promotional text is a short block (up to 170 chars) shown above the description
// on the App Store page, often labelled explicitly in scraped content.
function extractPromotionalText(markdown: string): string {
  const promoMatch = markdown.match(/promotional text[:\s\n]+([^\n]{10,170})/i)
  if (promoMatch) return promoMatch[1].trim()
  return ''
}
