import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import type { BenchConfig } from './config.js'
import type { Metric, ResultManifest, RunRecord, Verdict } from './model/run.js'

export function resultsRoot(root: string, config: BenchConfig): string {
  return isAbsolute(config.resultsDir) ? config.resultsDir : join(root, config.resultsDir)
}

export function newResultId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-').replace('Z', '')
}

export function createResult(dir: string, resultId: string, config: BenchConfig, versions: Record<string, string>): ResultManifest {
  mkdirSync(join(dir, 'runs'), { recursive: true })
  const manifest: ResultManifest = {
    resultId,
    createdAt: new Date().toISOString(),
    config: {
      provider: config.provider,
      participantModel: config.participantModel,
      participantEffort: config.participantEffort,
      judgeModel: config.judgeModel,
      judgeEffort: config.judgeEffort,
      stage: config.stage,
      timeoutMs: config.timeoutMs,
      maxBudgetUsd: config.maxBudgetUsd,
      repeats: config.repeats,
    },
    versions,
    runs: [],
  }
  writeManifest(dir, manifest)
  return manifest
}

export function writeManifest(dir: string, manifest: ResultManifest): void {
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify({ ...manifest, runs: [] }, null, 2)}\n`)
}

/** The manifest keeps the settings; the runs are read back from their own files. */
export function readManifest(dir: string): ResultManifest {
  const path = join(dir, 'manifest.json')
  if (!existsSync(path)) throw new Error(`результат не найден: ${path}`)
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as ResultManifest
  const legacy = manifest.config as ResultManifest['config'] & {
    participantProvider?: string
    judgeProvider?: string
    model?: string
    effort?: string
  }
  return {
    ...manifest,
    config: {
      ...legacy,
      provider: legacy.provider ?? legacy.participantProvider ?? legacy.judgeProvider ?? 'claude',
      participantModel: legacy.participantModel ?? legacy.model ?? '',
      participantEffort: legacy.participantEffort ?? legacy.effort ?? '',
    },
    runs: readRuns(dir),
  }
}

export interface RunEntry {
  record: RunRecord
  /** The directory the record was read from, whatever it happens to be named. */
  dir: string
}

/**
 * Records are found by reading the directories, not by rebuilding their names:
 * a result written before the naming changed still has to be readable.
 */
export function readRunEntries(dir: string): RunEntry[] {
  const runsDir = join(dir, 'runs')
  if (!existsSync(runsDir)) return []
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(runsDir, entry.name))
    .filter((path) => existsSync(join(path, 'run.json')))
    .map((path) => ({
      record: renameMetrics(JSON.parse(readFileSync(join(path, 'run.json'), 'utf8')) as RunRecord),
      dir: path,
    }))
    .sort((a, b) => a.record.runId.localeCompare(b.record.runId))
}

/**
 * The metrics were once called `Q`, `SR` and `IS`. Results taken under those
 * names are read under the current ones, so a rename does not empty a table
 * that was correct when it was written.
 */
const FORMER_METRICS: Record<string, Metric> = {
  Q: 'spec-quality',
  SR: 'spec-fit',
  IS: 'impl-fit',
}

function renameMetrics(record: RunRecord): RunRecord {
  const verdicts: Partial<Record<Metric, Verdict>> = {}
  for (const [key, verdict] of Object.entries(record.verdicts)) {
    if (verdict === undefined) continue
    const metric = FORMER_METRICS[key] ?? (key as Metric)
    // Verdicts written before judges ruled item by item carry no findings.
    verdicts[metric] = { ...verdict, metric, findings: verdict.findings ?? [], evidence: verdict.evidence ?? [] }
  }
  return { ...record, verdicts }
}

export function readRuns(dir: string): RunRecord[] {
  return readRunEntries(dir).map((entry) => entry.record)
}

export function latestResult(root: string, config: BenchConfig): string {
  const base = resultsRoot(root, config)
  if (!existsSync(base)) throw new Error(`каталог результатов пуст: ${base}`)
  const entries = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const last = entries.at(-1)
  if (!last) throw new Error(`каталог результатов пуст: ${base}`)
  return join(base, last)
}

export function resolveResult(root: string, config: BenchConfig, id: string | undefined): string {
  if (id === undefined) return latestResult(root, config)
  return isAbsolute(id) ? id : join(resultsRoot(root, config), id)
}
