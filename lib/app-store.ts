export interface AppStoreUrlParts {
  appId: string
  country: string
  slug: string | null
}

/**
 * Extracts the numeric app ID from an App Store URL.
 * Handles: https://apps.apple.com/us/app/spotify/id324684580
 */
export function extractAppId(url: string): string | null {
  const match = url.match(/\/id(\d+)/)
  return match ? match[1] : null
}

/**
 * Extracts the two-letter country code from an App Store URL.
 * Falls back to 'us' if not present.
 */
export function extractCountry(url: string): string {
  const match = url.match(/apps\.apple\.com\/([a-z]{2})\//)
  return match ? match[1] : 'us'
}

/**
 * Extracts the app slug (human-readable name segment) from the URL.
 */
export function extractSlug(url: string): string | null {
  const match = url.match(/\/app\/([^/]+)\/id\d+/)
  return match ? match[1] : null
}

/**
 * Parses all useful parts from an App Store URL in one call.
 * Returns null if the URL is not a recognisable App Store listing.
 */
export function parseAppStoreUrl(url: string): AppStoreUrlParts | null {
  const appId = extractAppId(url)
  if (!appId) return null
  return {
    appId,
    country: extractCountry(url),
    slug: extractSlug(url),
  }
}

/**
 * Returns true if the string looks like an Apple App Store app listing URL.
 */
export function isAppStoreUrl(url: string): boolean {
  return /apps\.apple\.com\/[a-z]{2}\/app\/.+\/id\d+/.test(url)
}

/**
 * Builds an iTunes Lookup API URL for a given app ID and country.
 */
export function itunesLookupUrl(appId: string, country: string): string {
  return `https://itunes.apple.com/lookup?id=${appId}&country=${country}&entity=software`
}

/**
 * Builds an iTunes RSS customer reviews URL.
 */
export function itunesReviewsUrl(appId: string, country: string): string {
  return `https://itunes.apple.com/${country}/rss/customerreviews/id=${appId}/sortBy=mostRecent/json`
}

/**
 * Builds an iTunes Search API URL for finding apps in a category.
 */
export function itunesSearchUrl(term: string, country: string, limit = 5): string {
  const encoded = encodeURIComponent(term)
  return `https://itunes.apple.com/search?term=${encoded}&entity=software&country=${country}&limit=${limit}`
}
