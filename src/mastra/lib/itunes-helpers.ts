type ReviewLike = { rating: number; text: string }

export function getLabel(node: unknown): string {
  if (typeof node === 'object' && node !== null) {
    return String((node as Record<string, unknown>).label ?? '')
  }
  return ''
}

export const POSITIVE_KEYWORDS: Record<string, string> = {
  'easy to use': 'ease of use',
  intuitive: 'intuitive UI',
  'great design': 'design quality',
  fast: 'performance',
  love: 'user delight',
  helpful: 'helpfulness',
  amazing: 'user delight',
  'works great': 'reliability',
  offline: 'offline support',
}

export const NEGATIVE_KEYWORDS: Record<string, string> = {
  crash: 'crashes/stability',
  bug: 'bugs',
  slow: 'performance',
  expensive: 'pricing',
  subscription: 'subscription model',
  ads: 'ads',
  battery: 'battery drain',
  update: 'update issues',
  login: 'login/auth issues',
  'not working': 'reliability',
}

export function calcTrend(
  reviews: ReviewLike[],
): 'improving' | 'declining' | 'stable' | 'insufficient_data' {
  if (reviews.length < 10) return 'insufficient_data'
  const mid = Math.floor(reviews.length / 2)
  const recent = avg(reviews.slice(0, mid).map((r) => r.rating))
  const older = avg(reviews.slice(mid).map((r) => r.rating))
  const delta = recent - older
  if (delta > 0.3) return 'improving'
  if (delta < -0.3) return 'declining'
  return 'stable'
}

export function extractThemes(reviews: ReviewLike[]): {
  positiveThemes: string[]
  negativeThemes: string[]
} {
  const pos: Record<string, number> = {}
  const neg: Record<string, number> = {}
  for (const r of reviews) {
    const text = r.text.toLowerCase()
    const kws = r.rating >= 4 ? POSITIVE_KEYWORDS : NEGATIVE_KEYWORDS
    const counter = r.rating >= 4 ? pos : neg
    for (const [kw, theme] of Object.entries(kws)) {
      if (text.includes(kw)) counter[theme] = (counter[theme] ?? 0) + 1
    }
  }
  const top = (c: Record<string, number>) =>
    Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t)
  return { positiveThemes: top(pos), negativeThemes: top(neg) }
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}
