import { METRICS, type Metric } from './run.js'

/**
 * How much of the process a run exercises. The benchmark compares whole
 * processes, but a stage isolates one part of one — a specification written
 * and never implemented is still a specification, and judging it alone says
 * something the full cycle cannot.
 */
export const STAGES = ['full', 'spec'] as const
export type Stage = (typeof STAGES)[number]

export const DEFAULT_STAGE: Stage = 'full'

export const STAGE_TITLES: Record<Stage, string> = {
  full: 'Полный цикл',
  spec: 'Только спецификация',
}

/** A metric a stage cannot produce is not scored, not judged, and not zero. */
export const STAGE_METRICS: Record<Stage, readonly Metric[]> = {
  full: METRICS,
  spec: ['spec-quality', 'spec-fit'],
}

/** Without an implementation there is nothing to run tests against. */
export function producesCode(stage: Stage): boolean {
  return STAGE_METRICS[stage].includes('impl-fit')
}

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value)
}
