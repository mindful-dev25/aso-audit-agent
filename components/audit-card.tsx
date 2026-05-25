'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { AuditResult } from '@/src/mastra/workflows/aso-audit-workflow'

// ─── Score ring ──────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const color =
    clamped >= 75 ? 'text-emerald-600' : clamped >= 50 ? 'text-amber-500' : 'text-rose-500'

  return (
    <div className={`flex flex-col items-center gap-1 ${color}`}>
      <span className="text-6xl font-bold tabular-nums leading-none">{clamped}</span>
      <span className="text-sm font-medium text-muted-foreground">/ 100</span>
    </div>
  )
}

// ─── Dimension row ────────────────────────────────────────────────────────────

function DimensionBar({
  name,
  score,
  weight,
  findings,
  recommendations,
}: {
  name: string
  score: number
  weight: number
  findings: string
  recommendations: string[]
}) {
  const pct = Math.round((score / 10) * 100)
  const color =
    score >= 7.5
      ? 'bg-emerald-500'
      : score >= 5
        ? 'bg-amber-400'
        : 'bg-rose-500'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{name}</span>
        <span className="tabular-nums text-muted-foreground">
          {score.toFixed(1)}/10 · {Math.round(weight * 100)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{findings}</p>
      {recommendations.length > 0 && (
        <ul className="space-y-0.5 pl-3 text-xs text-muted-foreground">
          {recommendations.map((r, i) => (
            <li key={i} className="list-disc">{r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Recommendation item ─────────────────────────────────────────────────────

function RecommendationItem({
  title,
  evidence,
  before,
  after,
}: {
  title: string
  evidence: string
  before?: string
  after?: string
}) {
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{evidence}</p>
      {(before ?? after) && (
        <div className="mt-2 grid gap-1.5 text-xs">
          {before && (
            <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 font-mono text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              <span className="select-none mr-1 opacity-60">−</span>{before}
            </div>
          )}
          {after && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <span className="select-none mr-1 opacity-60">+</span>{after}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Recommendation section ───────────────────────────────────────────────────

function RecommendationSection({
  title,
  subtitle,
  items,
}: {
  title: string
  subtitle: string
  items: AuditResult['quickWins']
}) {
  if (items.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((r, i) => (
          <RecommendationItem key={i} {...r} />
        ))}
      </CardContent>
    </Card>
  )
}

// ─── Competitor table ─────────────────────────────────────────────────────────

function CompetitorTable({
  competitors,
}: {
  competitors: AuditResult['competitors']
}) {
  if (competitors.length === 0) return null
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium">App</th>
            <th className="px-3 py-2 text-right font-medium">Rating</th>
            <th className="px-3 py-2 text-right font-medium">Reviews</th>
            <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Key difference</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {competitors.map((c, i) => (
            <tr key={i} className="hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{c.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.rating.toFixed(1)}★</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {c.ratingCount.toLocaleString()}
              </td>
              <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">
                {c.keyDifference}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main AuditCard ──────────────────────────────────────────────────────────

export function AuditCard({ audit }: { audit: AuditResult }) {
  return (
    <div className="space-y-4 py-2">
      {/* Overall score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">ASO Score Card</CardTitle>
          <p className="text-sm text-muted-foreground">{audit.appName}</p>
        </CardHeader>
        <CardContent className="flex items-center gap-8">
          <ScoreRing score={audit.overallScore} />
          <div className="flex-1 space-y-3">
            {audit.dimensions.map((d, i) => (
              <DimensionBar key={i} {...d} />
            ))}
          </div>
        </CardContent>
      </Card>

      <RecommendationSection
        title="Quick Wins"
        subtitle="High impact, implementable today"
        items={audit.quickWins}
      />
      <RecommendationSection
        title="High-Impact Changes"
        subtitle="Significant effort, significant return"
        items={audit.highImpactChanges}
      />
      <RecommendationSection
        title="Strategic Recommendations"
        subtitle="Longer-term improvements"
        items={audit.strategicRecommendations}
      />

      {/* Competitor comparison */}
      {audit.competitors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Competitor Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <CompetitorTable competitors={audit.competitors} />
          </CardContent>
        </Card>
      )}

      <Separator />
    </div>
  )
}
