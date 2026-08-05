import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import type { BenchConfig } from './config.js'
import type { ResultManifest, RunRecord } from './model/run.js'

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
      model: config.model,
      effort: config.effort,
      judgeModel: config.judgeModel,
      judgeEffort: config.judgeEffort,
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
  return { ...manifest, runs: readRuns(dir) }
}

export function readRuns(dir: string): RunRecord[] {
  const runsDir = join(dir, 'runs')
  if (!existsSync(runsDir)) return []
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(runsDir, entry.name, 'run.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as RunRecord)
    .sort((a, b) => a.runId.localeCompare(b.runId))
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
