# ASO Audit Agent

AI-powered App Store Optimization audits. Paste any Apple App Store URL into the chat and receive a full 10-dimension ASO health report with scored dimensions, before/after recommendations, and competitor comparisons.

## Setup

```bash
cp .env.example .env
# Fill in at least ANTHROPIC_API_KEY (or OPENAI_API_KEY as a fallback)

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste an App Store URL.

**Example:** `https://apps.apple.com/us/app/spotify-music-and-podcasts/id324684580`

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Recommended | Claude Sonnet for analysis |
| `OPENAI_API_KEY` | Fallback | GPT-4o-mini if no Anthropic key |
| `FIRECRAWL_API_KEY` | Optional | Scrapes subtitle + promotional text from the App Store page |
| `MASTRA_DB_URL` | Optional | LibSQL URL (defaults to `file:./mastra.db`) |

## Audit dimensions

The agent scores each listing on 10 dimensions using a weighted framework:

| Dimension | Weight |
|---|---|
| Title (30 chars) | 20% |
| Subtitle (30 chars) | 15% |
| Keyword field (100 chars) | 15% |
| Screenshots | 15% |
| Ratings & reviews | 15% |
| Description | 10% |
| App preview video | 5% |
| Icon | 5% |
| Conversion signals | 5% |
| Competitive position | 5% |

## Architecture decisions

**Next.js 15 + Mastra Core** — Single `npm run dev` command. Next.js App Router handles streaming with AI SDK v6's `createTextStreamResponse`. Mastra wraps the agent and workflow lifecycle.

**iTunes APIs (no key required)** — Lookup, Reviews RSS, and Search APIs are all free and unauthenticated. This keeps the app functional with zero API keys for data collection.

**Firecrawl is optional** — The subtitle and promotional text fields are only accessible by scraping the App Store page. If `FIRECRAWL_API_KEY` is absent, the audit proceeds with iTunes API data alone (title, description, ratings, reviews, competitors). The score simply reflects what's available.

**Single workflow step for parallel collection** — Instead of Mastra's `.parallel()` (which enforces a shared input schema across all branches), the `collectDataStep` uses `Promise.all()` to run scraping, reviews, and competitor lookups in parallel inside a single step. Simpler types, same concurrency.

**Structured output via `generateObject`** — The `analyzeAuditStep` calls `generateObject` with the full `AuditResultSchema` Zod schema. This guarantees the LLM returns valid, typed JSON and eliminates manual parsing.

**`audit-result` code fence** — The agent wraps the JSON result in a ` ```audit-result ``` ` fence. The frontend detects this fence, parses the JSON, and renders the rich `AuditCard` component instead of raw markdown.
