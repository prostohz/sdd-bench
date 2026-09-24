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

/** How a requirement of the intent survived the move into a specification. */
export const COVERAGE_RULINGS = ['covered', 'partial', 'distorted', 'missing'] as const
export type CoverageRuling = (typeof COVERAGE_RULINGS)[number]

/** How a requirement of a specification fared in the implementation. */
export const IMPL_RULINGS = ['verified', 'present', 'partial', 'broken', 'absent'] as const
export type ImplRuling = (typeof IMPL_RULINGS)[number]

export const SEVERITIES = ['blocker', 'major', 'minor'] as const
export type Severity = (typeof SEVERITIES)[number]

/** The five properties a specification is held to, each scored on its own. */
export const QUALITY_AXES = [
  'completeness',
  'ambiguity',
  'verifiability',
  'structure',
  'proportion',
] as const
export type QualityAxis = (typeof QUALITY_AXES)[number]

export const AXIS_TITLES: Record<QualityAxis, string> = {
  completeness: 'Полнота',
  ambiguity: 'Однозначность',
  verifiability: 'Проверяемость',
  structure: 'Структура',
  proportion: 'Соразмерность',
}

/** What a finding is about, which is also the vocabulary its ruling comes from. */
export const FINDING_KINDS = ['requirement', 'addition', 'defect', 'contradiction'] as const
export type FindingKind = (typeof FINDING_KINDS)[number]

/**
 * One thing a judge ruled on. A verdict is a list of these and nothing else:
 * the judge names items and rules on them, and the score is arithmetic over
 * the rulings — never a number the judge chose.
 */
export interface Finding {
  kind: FindingKind
  /** A requirement's identifier, or a short name for a defect or an addition. */
  item: string
  /** What the item says, filled in by the harness where it knows the wording. */
  statement: string
  /** A ruling for a requirement, a severity for everything else. */
  ruling: string
  /** Where it is seen: a path, `path:line`, a quotation, or a check that was run. */
  where: string
  note: string
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
  /** Computed from the findings, on the rubric's 0..10 scale. */
  score: number
  rationale: string
  /** Every item ruled on. Empty only in results taken before judges ruled by item. */
  findings: Finding[]
  /** Checks the judge ran, and quotations from judges that wrote no findings. */
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
    provider: string
    participantModel: string
    participantEffort: string
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
