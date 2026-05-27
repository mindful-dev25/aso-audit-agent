import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'
import { asoAgent } from './agents/aso-agent'
import { asoAuditWorkflow } from './workflows/aso-audit-workflow'

export const mastra = new Mastra({
  agents: { asoAgent },
  workflows: { asoAuditWorkflow },
  ...(process.env.MASTRA_DB_URL
    ? {
        storage: new LibSQLStore({
          id: 'aso-audit-db',
          url: process.env.MASTRA_DB_URL,
        }),
      }
    : {}),
})
