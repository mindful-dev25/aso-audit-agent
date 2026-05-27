# ASO Audit Agent

AI-powered App Store Optimization audits. Paste any Apple App Store URL into the chat and receive a full 10-dimension ASO health report with scored dimensions, before/after recommendations, and competitor comparisons.

## Setup

```bash
cp .env.example .env
# Fill in GROQ_API_KEY (required)

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste an App Store URL.

**Example:** `https://apps.apple.com/us/app/spotify-music-and-podcasts/id324684580`

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Required | LLM for conversation and structured audit analysis |
| `FIRECRAWL_API_KEY` | Optional | Scrapes subtitle + promotional text from the App Store page |
| `MASTRA_DB_URL` | Optional | LibSQL URL for conversation persistence (defaults to local `mastra.db`) |

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

## Architecture

**Next.js 15 + Mastra Core** — Single `npm run dev` command. Next.js App Router handles streaming via AI SDK v6's `createTextStreamResponse`. Mastra wraps the agent lifecycle and conversation memory (LibSQL-backed, defaults to `mastra.db`).

**Groq as the LLM provider** — Both the conversational agent and structured audit analysis run on Groq (`openai/gpt-oss-120b`). No Anthropic or OpenAI key is needed.

**iTunes APIs (no key required)** — Lookup, Reviews RSS, and Search APIs are all free and unauthenticated. This keeps data collection functional with zero extra API keys.

**Firecrawl is optional** — The subtitle and promotional text fields are only accessible by scraping the App Store page. If `FIRECRAWL_API_KEY` is absent the audit proceeds with iTunes API data alone (title, description, ratings, reviews, competitors). The score reflects what's available.

**Two-step Mastra workflow** — `collectDataStep` uses `Promise.all()` to fetch app metadata, reviews, and competitor data in parallel. `analyzeAuditStep` runs two `generateObject` calls in parallel — one for scores/findings, one for recommendations — to stay within token limits and avoid truncation.

**Two-tool agent surface** — The `asoAgent` exposes exactly two tools: `fetchAppMetadata` (confirms the app before running) and `triggerASOAudit` (runs the full workflow). The agent follows a strict confirm-then-run flow so audits are never started on the wrong app.

**`audit-result` code fence** — The agent wraps the JSON result in a ` ```audit-result ``` ` fence. The frontend detects this fence, parses the JSON, and renders the rich `AuditCard` component instead of raw markdown.

**Thread-based memory** — Each browser session generates a UUID thread ID that is passed to `agent.stream()`. Mastra persists conversation history so context is maintained across messages within a session.
