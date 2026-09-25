import { type Metric, type RunRecord } from '../model/run.js'
import type { TokenPricing } from '../config.js'
import { DEFAULT_STAGE, STAGE_METRICS } from '../model/stage.js'
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
  quality: number | null
  timeFactor: number | null
  costFactor: number | null
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

export function runCost(record: RunRecord, pricing?: TokenPricing): { value: number | null; estimated: boolean } {
  const telemetry = record.telemetry
  if (!telemetry) return { value: null, estimated: false }
  if (telemetry.costUsd !== undefined && Number.isFinite(telemetry.costUsd) && telemetry.costUsd >= 0) {
    return { value: telemetry.costUsd, estimated: false }
  }
  if (!pricing) return { value: null, estimated: false }
  if (telemetry.inputTokens + telemetry.outputTokens + telemetry.cacheReadTokens + telemetry.cacheCreationTokens <= 0) {
    return { value: null, estimated: false }
  }
  const uncached = Math.max(0, telemetry.inputTokens - telemetry.cacheReadTokens - telemetry.cacheCreationTokens)
  const value = (
    uncached * pricing.inputUsdPerMillion +
    telemetry.cacheReadTokens * pricing.cachedInputUsdPerMillion +
    telemetry.cacheCreationTokens * pricing.cacheWriteUsdPerMillion +
    telemetry.outputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000
  return { value: Number.isFinite(value) && value >= 0 ? value : null, estimated: true }
}

export function scoreRun(record: RunRecord, peers: RunRecord[] = [record], pricing?: TokenPricing): RunScore {
  const base = {
    runId: record.runId,
    taskId: record.taskId,
    taskClass: record.taskClass,
    participantId: record.participantId,
    repeat: record.repeat,
  }

  const zeroReason = failureReason(record)
  if (zeroReason !== undefined) {
    return { ...base, value: 0, quality: 0, timeFactor: null, costFactor: null, normalized: {}, zeroReason }
  }

  // A stage that writes no code produces no IS, and its score is the
  // geometric mean of what it does produce — not a zero for what it cannot.
  const metrics = STAGE_METRICS[record.stage ?? DEFAULT_STAGE]
  const normalized: Partial<Record<Metric, number>> = {}
  for (const metric of metrics) {
    const verdict = record.verdicts[metric]
    if (verdict === undefined) return { ...base, value: null, quality: null, timeFactor: null, costFactor: null, normalized, zeroReason: undefined }
    normalized[metric] = normalize(verdict.score)
  }

  const product = metrics.reduce((acc, metric) => acc * (normalized[metric] ?? 0), 1)
  const quality = 100 * product ** (1 / metrics.length)
  const comparable = peers.filter((peer) => peer.taskId === record.taskId && peer.taskClass === record.taskClass && failureReason(peer) === undefined)
  const durations = comparable.map((peer) => peer.telemetry?.activeMs ?? peer.telemetry?.durationMs ?? null)
  const costs = comparable.map((peer) => runCost(peer, pricing).value)
  if (durations.some((value) => value === null || !Number.isFinite(value) || value < 0) ||
      costs.some((value) => value === null || !Number.isFinite(value) || value < 0)) {
    return { ...base, value: null, quality, timeFactor: null, costFactor: null, normalized, zeroReason: undefined }
  }
  const duration = record.telemetry?.activeMs ?? record.telemetry?.durationMs ?? null
  const cost = runCost(record, pricing).value
  if (duration === null || cost === null) {
    return { ...base, value: null, quality, timeFactor: null, costFactor: null, normalized, zeroReason: undefined }
  }
  const timeFactor = ratio(Math.min(...durations as number[]), duration)
  const costFactor = ratio(Math.min(...costs as number[]), cost)
  return { ...base, value: quality * (0.8 + 0.1 * timeFactor + 0.1 * costFactor), quality, timeFactor, costFactor, normalized, zeroReason: undefined }
}

function ratio(best: number, actual: number): number {
  if (best === 0) return actual === 0 ? 1 : 0
  return best / actual
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

export function scoreParticipants(records: RunRecord[], pricing?: TokenPricing): ParticipantScore[] {
  const scores = records.map((record) => scoreRun(record, records, pricing))
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
      efficiency: efficiencyOf(records.filter((r) => r.participantId === participantId), pricing),
    }
  })
}

function efficiencyOf(records: RunRecord[], pricing?: TokenPricing): Efficiency {
  return {
    runs: records.length,
    meanDurationMs: mean(records.map((r) => r.telemetry?.activeMs ?? r.telemetry?.durationMs ?? null)),
    meanTotalTokens: mean(records.map((r) => r.telemetry?.totalTokens ?? null)),
    meanCostUsd: mean(records.map((r) => runCost(r, pricing).value)),
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
