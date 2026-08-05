import { METRICS, type Metric, type RunRecord } from '../model/run.js'
import type { TaskClass } from '../model/task.js'

/** The rubric every judge answers on. */
export const JUDGE_SCALE_MAX = 10

export interface RunScore {
  runId: string
  taskId: string
  taskClass: TaskClass
  participantId: string
  repeat: number
  /** `null` while a metric of an otherwise finished run has no verdict. */
  value: number | null
  normalized: Partial<Record<Metric, number>>
  /** Why the run scored zero, when it did. */
  zeroReason: string | undefined
}

export interface Aggregate<K extends string> {
  key: K
  score: number | null
  parts: number
}

export interface ParticipantScore {
  participantId: string
  tasks: Aggregate<string>[]
  classes: Aggregate<TaskClass>[]
  /** Mean over classes, so every class carries the same weight. */
  score: number | null
  efficiency: Efficiency
}

export interface Efficiency {
  runs: number
  meanDurationMs: number | null
  meanTotalTokens: number | null
  meanCostUsd: number | null
}

export function normalize(score: number): number {
  return clamp(score / JUDGE_SCALE_MAX, 0, 1)
}

export function scoreRun(record: RunRecord): RunScore {
  const base = {
    runId: record.runId,
    taskId: record.taskId,
    taskClass: record.taskClass,
    participantId: record.participantId,
    repeat: record.repeat,
  }

  const zeroReason = failureReason(record)
  if (zeroReason !== undefined) {
    return { ...base, value: 0, normalized: {}, zeroReason }
  }

  const normalized: Partial<Record<Metric, number>> = {}
  for (const metric of METRICS) {
    const verdict = record.verdicts[metric]
    if (verdict === undefined) return { ...base, value: null, normalized, zeroReason: undefined }
    normalized[metric] = normalize(verdict.score)
  }

  const product = METRICS.reduce((acc, metric) => acc * (normalized[metric] ?? 0), 1)
  return { ...base, value: 100 * Math.cbrt(product), normalized, zeroReason: undefined }
}

/**
 * A run scores zero when it failed, ran out of time, or left the project's own
 * tests worse than it found them. Greenfield tasks carry no baseline.
 */
function failureReason(record: RunRecord): string | undefined {
  if (record.status === 'timeout') return 'превышен лимит времени'
  if (record.status === 'error') return record.statusDetail ?? 'запуск завершился ошибкой'
  if (record.taskClass !== 'greenfield' && record.baseline && record.baseline.passRatio < 1) {
    return `регрессия: прошло ${formatRatio(record.baseline.passRatio)} исходных тестов`
  }
  return undefined
}

export function scoreParticipants(records: RunRecord[]): ParticipantScore[] {
  const scores = records.map(scoreRun)
  const participantIds = [...new Set(scores.map((s) => s.participantId))].sort()

  return participantIds.map((participantId) => {
    const own = scores.filter((s) => s.participantId === participantId)

    const tasks = groupBy(own, (s) => s.taskId).map(([taskId, runs]) => ({
      key: taskId,
      score: mean(runs.map((r) => r.value)),
      parts: runs.length,
    }))

    const classes = groupBy(own, (s) => s.taskClass).map(([taskClass, runs]) => {
      const perTask = groupBy(runs, (s) => s.taskId).map(([, group]) => mean(group.map((r) => r.value)))
      return { key: taskClass, score: mean(perTask), parts: perTask.length }
    })

    return {
      participantId,
      tasks,
      classes,
      score: mean(classes.map((c) => c.score)),
      efficiency: efficiencyOf(records.filter((r) => r.participantId === participantId)),
    }
  })
}

function efficiencyOf(records: RunRecord[]): Efficiency {
  const telemetry = records.map((r) => r.telemetry).filter((t) => t !== undefined)
  return {
    runs: records.length,
    meanDurationMs: mean(telemetry.map((t) => t.durationMs)),
    meanTotalTokens: mean(telemetry.map((t) => t.totalTokens)),
    meanCostUsd: mean(telemetry.map((t) => t.costUsd ?? null)),
  }
}

/** `null` anywhere makes the mean unknown rather than silently smaller. */
function mean(values: (number | null)[]): number | null {
  if (values.length === 0) return null
  if (values.some((v) => v === null)) return null
  return (values as number[]).reduce((a, b) => a + b, 0) / values.length
}

function groupBy<T, K extends string>(items: T[], key: (item: T) => K): [K, T[]][] {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}
