import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { defaultModel } from '../lib/model'
import { fetchAppMetadata, AppMetadataSchema } from '../tools/fetch-app-metadata'
import { asoAuditWorkflow } from '../workflows/aso-audit-workflow'

// ─── triggerASOAudit tool ────────────────────────────────────────────────────
// Runs the full workflow and returns the audit result as a JSON string so the
// agent can wrap it in the ```audit-result``` fence for the UI to render.

const triggerASOAudit = createTool({
  id: 'trigger-aso-audit',
  description:
    'Runs the full ASO audit workflow for a confirmed app. Call this only after the user has confirmed the app identity. Returns the complete structured audit result.',
  inputSchema: z.object({
    appId: z.string().describe('Numeric iTunes app ID'),
    appUrl: z.string().describe('Full Apple App Store URL'),
    country: z.string().describe('Two-letter country code, e.g. "us"'),
    category: z.string().describe('Primary app category, e.g. "Music"'),
    appMetadata: AppMetadataSchema.describe('Full metadata object from fetchAppMetadata'),
  }),
  outputSchema: z.object({
    auditJson: z.string().describe('Full audit result as a JSON string'),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    try {
      const run = await asoAuditWorkflow.createRun()
      const result = await run.start({ inputData })

      if (result.status !== 'success') {
        return { auditJson: '{}', error: `Workflow ended with status: ${result.status}` }
      }

      return { auditJson: JSON.stringify(result.result) }
    } catch (err) {
      return { auditJson: '{}', error: String(err) }
    }
  },
})

export const asoAgent = new Agent({
  id: 'aso-agent',
  name: 'ASO Audit Assistant',
  model: defaultModel,
  tools: {
    fetchAppMetadata,
    triggerASOAudit,
  },
  instructions: `You are an expert ASO (App Store Optimization) analyst. Your job is to help users audit their App Store listings.

## Conversation flow

**Step 1 — Detect URL**
When the user sends a message containing an Apple App Store URL (apps.apple.com), immediately call fetchAppMetadata with that URL. Do not ask for confirmation before calling it.

**Step 2 — Confirm the app**
Once you have the metadata, present a brief confirmation in this format:
"I found **{appName}** by {developer} — {rating}★ ({ratingCount} ratings) in the {category} category. Is this the app you want to audit?"
Include the icon URL in markdown image syntax if available: ![icon]({iconUrl})

**Step 3 — Wait for confirmation**
If the user says yes / correct / proceed / sure (or any clear affirmative), move to step 4.
If they say no or provide a different URL, go back to step 1 with the new URL.

**Step 4 — Run the audit**
Say: "Starting your ASO audit — I'm gathering listing data, reviews, and competitor info in parallel. This takes about 20–30 seconds."
Then call triggerASOAudit with the appId, appUrl, country, category, and appMetadata from step 1.

**Step 5 — Present results**
When the audit completes, output the result EXACTLY as follows — do not summarise or omit anything:

\`\`\`audit-result
{auditJson}
\`\`\`

Replace {auditJson} with the raw auditJson string from the tool result.

## Rules
- Never fabricate app data — always call fetchAppMetadata first.
- Never run the audit without explicit user confirmation.
- If fetchAppMetadata returns found: false, say "I couldn't find that app — please check the URL and try again."
- Keep status messages short. The user is waiting, not reading a novel.
- If the audit tool returns an error, report it clearly and offer to retry.`,
})
