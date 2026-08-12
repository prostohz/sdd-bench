import {
  QUALITY_AXES,
  type CoverageRuling,
  type Finding,
  type ImplRuling,
  type Metric,
  type QualityAxis,
  type Severity,
} from '../model/run.js'

/**
 * What each ruling is worth, as a share of one requirement. A requirement that
 * was moved across but blunted is worth half; one whose meaning was swapped is
 * worth almost nothing, because a reader of the specification is now wrong
 * rather than merely uninformed.
 */
const COVERAGE_WEIGHT: Record<CoverageRuling, number> = {
  covered: 1,
  partial: 0.5,
  distorted: 0.2,
  missing: 0,
}

/**
 * Code that was seen to work counts fully; code that merely looks right counts
 * for less, so a judge that runs nothing cannot hand out a top score.
 */
const IMPL_WEIGHT: Record<ImplRuling, number> = {
  verified: 1,
  present: 0.6,
  partial: 0.35,
  broken: 0.1,
  absent: 0,
}

/**
 * Taken off the coverage that was earned, as a share of the whole. A `minor`
 * addition costs nothing: where the intent is silent the specification is
 * obliged to decide something, and a decision named openly is the work being
 * done, not a fault. A specification that pads itself with such decisions is
 * marked down by `spec-quality` for proportion, which is where bloat belongs.
 */
const ADDITION_PENALTY: Record<Severity, number> = { blocker: 0.2, major: 0.1, minor: 0 }

/** Inventions never sink a result on their own; missing requirements do. */
const ADDITION_CAP = 0.3

/** Points off the one axis of ten the defect belongs to. */
const DEFECT_PENALTY: Record<Severity, number> = { blocker: 4, major: 1.5, minor: 0.5 }

/**
 * The score of a verdict, from its findings. The judge rules; the arithmetic
 * is here, so the same rulings always give the same number and a score can be
 * argued with by arguing with a ruling.
 */
export function tally(metric: Metric, findings: Finding[]): number {
  if (metric === 'spec-quality') return round(qualityScore(findings))
  const weights = metric === 'impl-fit' ? IMPL_WEIGHT : COVERAGE_WEIGHT
  return round(coverageScore(findings, weights as Record<string, number>))
}

function coverageScore(findings: Finding[], weights: Record<string, number>): number {
  const requirements = findings.filter((f) => f.kind === 'requirement')
  if (requirements.length === 0) return 0

  const earned = requirements.reduce((sum, f) => sum + (weights[f.ruling] ?? 0), 0) / requirements.length
  const penalty = findings
    .filter((f) => f.kind === 'addition' || f.kind === 'contradiction')
    .reduce((sum, f) => sum + (ADDITION_PENALTY[f.ruling as Severity] ?? 0), 0)

  return 10 * clamp(earned - Math.min(ADDITION_CAP, penalty), 0, 1)
}

/**
 * Each property is scored on its own and the five are averaged, so a
 * specification is marked down where it is weak instead of being averaged into
 * the middle by an overall impression.
 */
function qualityScore(findings: Finding[]): number {
  const axes = qualityAxes(findings)
  return axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length
}

/** The per-axis scores behind a `spec-quality` verdict, for reading it back. */
export function qualityAxes(findings: Finding[]): { axis: QualityAxis; score: number }[] {
  return QUALITY_AXES.map((axis) => {
    const penalty = findings
      .filter((f) => f.kind === 'defect' && f.item === axis)
      .reduce((sum, f) => sum + (DEFECT_PENALTY[f.ruling as Severity] ?? 0), 0)
    return { axis, score: round(clamp(10 - penalty, 0, 10)) }
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Number(value.toFixed(2))
}
