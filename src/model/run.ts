import type { Stage } from './stage.js'
import type { TaskClass } from './task.js'

/**
 * The three judged metrics that make up the score of a run, each named after
 * what it holds against what: the specification on its own, the specification
 * against the requirements, the implementation against the specification.
 */
export const METRICS = ['spec-quality', 'spec-fit', 'impl-fit'] as const
export type Metric = (typeof METRICS)[number]

/** For a column heading, where the full title would not fit. */
export const METRIC_LABELS: Record<Metric, string> = {
  'spec-quality': 'Spec quality',
  'spec-fit': 'Spec fit',
  'impl-fit': 'Impl fit',
}

export const METRIC_TITLES: Record<Metric, string> = {
  'spec-quality': 'Качество спецификации',
  'spec-fit': 'Соответствие спецификации требованиям',
  'impl-fit': 'Соответствие реализации спецификации',
}

export const RUN_STATUSES = ['ok', 'error', 'timeout'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export interface Telemetry {
  /**
   * Measured by the harness around the agent invocation, with host sleep
   * excluded. A participant that delegates to subagents under-reports its own
   * `durationMs`, so the number it states is not the one it is compared on;
   * and a laptop that sleeps mid-run must not be charged to it either.
   */
  activeMs: number
  /** As the CLI reported it. */
  durationMs: number
  apiDurationMs: number | undefined
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalTokens: number
  costUsd: number | undefined
  numTurns: number | undefined
}

export interface TestOutcome {
  command: string
  exitCode: number
  /** Share of tests that kept passing, when the runner reports counts. */
  passRatio: number
  output: string
}

export interface Verdict {
  metric: Metric
  /** As given by the judge, on the rubric's 0..10 scale. */
  score: number
  rationale: string
  evidence: string[]
  judgeModel: string
}

export interface RunRecord {
  runId: string
  taskId: string
  taskClass: TaskClass
  /** How much of the process this run exercised. */
  stage: Stage
  participantId: string
  repeat: number
  status: RunStatus
  statusDetail: string | undefined
  startedAt: string
  finishedAt: string
  telemetry: Telemetry | undefined
  /** The project's own tests after the run; absent when regressions do not apply. */
  baseline: TestOutcome | undefined
  /** Hidden tests, reported but outside the score. */
  hidden: TestOutcome | undefined
  verdicts: Partial<Record<Metric, Verdict>>
  /** Model, CLI and tooling versions saved alongside the result. */
  versions: Record<string, string>
}

export interface ResultManifest {
  resultId: string
  createdAt: string
  config: {
    model: string
    effort: string
    judgeModel: string
    judgeEffort: string
    stage: Stage
    timeoutMs: number
    maxBudgetUsd: number | undefined
    repeats: number
  }
  versions: Record<string, string>
  runs: RunRecord[]
}

/** The stage is part of the name so two stages never share a directory. */
export function runDirName(record: {
  taskId: string
  stage: Stage | undefined
  participantId: string
  repeat: number
}): string {
  const stage = record.stage ?? 'full'
  return `${record.taskId}--${record.participantId}--${stage}--${record.repeat}`
}
