import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Reader } from './model/validate.js'

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORT_LEVELS)[number]

/**
 * One configuration for every participant: the same model, the same reasoning
 * settings and the same limits, as the methodology requires. Only the
 * canonical process differs between participants.
 */
export interface BenchConfig {
  model: string
  effort: Effort
  judgeModel: string
  judgeEffort: Effort
  /** Wall-clock limit for one participant run. */
  timeoutMs: number
  /** Wall-clock limit for one judgement. */
  judgeTimeoutMs: number
  maxBudgetUsd: number | undefined
  repeats: number
  /** Hosts every sandbox may reach, before task and participant additions. */
  allowHosts: string[]
  resultsDir: string
}

export const DEFAULT_CONFIG: BenchConfig = {
  model: 'claude-sonnet-5',
  effort: 'high',
  judgeModel: 'claude-opus-5',
  judgeEffort: 'high',
  timeoutMs: 45 * 60 * 1000,
  judgeTimeoutMs: 20 * 60 * 1000,
  maxBudgetUsd: undefined,
  repeats: 3,
  allowHosts: ['api.anthropic.com'],
  resultsDir: 'results',
}

export function loadConfig(root: string, path?: string): BenchConfig {
  const file = path ?? join(root, 'bench.json')
  if (!existsSync(file)) return { ...DEFAULT_CONFIG }

  const reader = Reader.of(file, JSON.parse(readFileSync(file, 'utf8')))
  const config: BenchConfig = {
    model: reader.optionalString('model') ?? DEFAULT_CONFIG.model,
    effort: optionalEffort(reader, 'effort') ?? DEFAULT_CONFIG.effort,
    judgeModel: reader.optionalString('judgeModel') ?? DEFAULT_CONFIG.judgeModel,
    judgeEffort: optionalEffort(reader, 'judgeEffort') ?? DEFAULT_CONFIG.judgeEffort,
    timeoutMs: reader.number('timeoutMs', DEFAULT_CONFIG.timeoutMs),
    judgeTimeoutMs: reader.number('judgeTimeoutMs', DEFAULT_CONFIG.judgeTimeoutMs),
    maxBudgetUsd: optionalNumber(reader, 'maxBudgetUsd'),
    repeats: reader.number('repeats', DEFAULT_CONFIG.repeats),
    allowHosts: orDefault(reader.stringArray('allowHosts'), DEFAULT_CONFIG.allowHosts),
    resultsDir: reader.optionalString('resultsDir') ?? DEFAULT_CONFIG.resultsDir,
  }
  if (config.repeats < 1) reader.problem('repeats: expected at least one run')
  reader.done()
  return config
}

function optionalEffort(reader: Reader, key: string): Effort | undefined {
  const raw = reader.optionalString(key)
  if (raw === undefined) return undefined
  if ((EFFORT_LEVELS as readonly string[]).includes(raw)) return raw as Effort
  reader.problem(`${key}: expected one of ${EFFORT_LEVELS.join(', ')}`)
  return undefined
}

function optionalNumber(reader: Reader, key: string): number | undefined {
  const value = reader.number(key, Number.NaN)
  return Number.isNaN(value) ? undefined : value
}

function orDefault(values: string[], fallback: string[]): string[] {
  return values.length > 0 ? values : fallback
}
