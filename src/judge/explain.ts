import { AXIS_TITLES, COVERAGE_RULINGS, IMPL_RULINGS, type Finding, type Metric } from '../model/run.js'
import { qualityAxes } from './tally.js'

/** Rulings that cost nothing; every other finding is what the score is made of. */
const FREE = new Set(['covered', 'verified'])

export function costly(finding: Finding): boolean {
  return !(finding.kind === 'requirement' && FREE.has(finding.ruling))
}

/**
 * What the score is made of, in one line: how the rulings fell, and — for
 * `spec-quality`, whose score is a mean of five — where each property stands.
 */
export function findingSummary(metric: Metric, findings: Finding[]): string {
  if (findings.length === 0) return ''
  if (metric === 'spec-quality') {
    return qualityAxes(findings)
      .map(({ axis, score }) => `${AXIS_TITLES[axis].toLowerCase()} ${score}`)
      .join(' · ')
  }

  // В порядке словаря решений, от лучшего к худшему, а не в порядке встречи.
  const vocabulary = metric === 'impl-fit' ? IMPL_RULINGS : COVERAGE_RULINGS
  const requirements = findings.filter((f) => f.kind === 'requirement')
  const parts = vocabulary
    .map((ruling) => ({ ruling, count: requirements.filter((f) => f.ruling === ruling).length }))
    .filter(({ count }) => count > 0)
    .map(({ ruling, count }) => `${ruling} ${count}`)

  const extra = findings.filter((f) => f.kind === 'addition' || f.kind === 'contradiction')
  if (extra.length > 0) {
    const word = extra[0]?.kind === 'contradiction' ? 'противоречий' : 'приписок'
    parts.push(`${word} ${extra.length}`)
  }
  return parts.join(' · ')
}

/** One finding as a line: what it is about, how it was ruled, and where. */
export function findingLine(finding: Finding): string {
  const where = finding.where && finding.where !== '—' ? ` [${finding.where}]` : ''
  const note = finding.note ? ` — ${finding.note}` : ''
  return `${finding.ruling}: ${subject(finding)}${where}${note}`
}

function subject(finding: Finding): string {
  if (finding.kind === 'defect') {
    const axis = AXIS_TITLES[finding.item as keyof typeof AXIS_TITLES] ?? finding.item
    return `${axis} — ${finding.statement}`
  }
  return [finding.item, finding.statement].filter(Boolean).join('. ')
}
