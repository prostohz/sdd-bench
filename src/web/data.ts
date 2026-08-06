import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import type { BenchConfig } from '../config.js'
import type { ResultManifest, RunRecord } from '../model/run.js'
import { run } from '../proc.js'
import { readManifest, readRunEntries, resultsRoot, type RunEntry } from '../results.js'
import { BASELINE_TAG } from '../run/participantRun.js'
import { restoreRepo } from '../sandbox/extract.js'

export interface ResultView {
  id: string
  dir: string
  manifest: ResultManifest
  entries: RunEntry[]
}

/** Newest first, because that is the one being looked at. */
export function listResults(root: string, config: BenchConfig): ResultView[] {
  const base = resultsRoot(root, config)
  if (!existsSync(base)) return []

  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(base, entry.name, 'manifest.json')))
    .map((entry) => join(base, entry.name))
    .sort()
    .reverse()
    .map((dir) => ({
      id: dir.split(sep).at(-1) ?? dir,
      dir,
      manifest: readManifest(dir),
      entries: readRunEntries(dir),
    }))
}

export function findResult(root: string, config: BenchConfig, id: string): ResultView | undefined {
  return listResults(root, config).find((result) => result.id === id)
}

export function findEntry(result: ResultView, runDir: string): RunEntry | undefined {
  return result.entries.find((entry) => entry.dir.split(sep).at(-1) === runDir)
}

export function runDirName(entry: RunEntry): string {
  return entry.dir.split(sep).at(-1) ?? entry.dir
}

/** The specification as it was handed to the judge, in its neutral directory. */
export function specFiles(entry: RunEntry): string[] {
  return walk(join(entry.dir, 'spec'))
}

/**
 * What the participant wrote, without what its tooling installed: the files
 * that changed since the baseline tag. The repository is unpacked once and
 * kept, because unpacking it on every request would be absurd.
 */
export async function implFiles(entry: RunEntry): Promise<string[]> {
  const repo = await ensureRepo(entry)
  if (repo === undefined) return []

  const from = await baseline(repo)
  if (from === undefined) return []

  const names = await run('git', ['diff', '--name-only', from, 'HEAD'], { cwd: repo })
  if (names.code !== 0) return []
  return names.stdout.split('\n').filter((line) => line.trim() !== '')
}

export async function ensureRepo(entry: RunEntry): Promise<string | undefined> {
  const bundle = join(entry.dir, 'repo.bundle')
  if (!existsSync(bundle)) return undefined

  const repo = join(entry.dir, 'repo')
  if (!existsSync(join(repo, '.git'))) await restoreRepo(bundle, repo)
  return repo
}

export async function readSpec(entry: RunEntry, path: string): Promise<string | undefined> {
  return readInside(join(entry.dir, 'spec'), path)
}

export async function readImpl(entry: RunEntry, path: string): Promise<string | undefined> {
  const repo = await ensureRepo(entry)
  return repo === undefined ? undefined : readInside(repo, path)
}

/** The whole run as a patch — the fastest way to see what it actually did. */
export async function implDiff(entry: RunEntry): Promise<string> {
  const repo = await ensureRepo(entry)
  if (repo === undefined) return ''

  const from = await baseline(repo)
  if (from === undefined) return ''

  const diff = await run('git', ['diff', from, 'HEAD'], { cwd: repo })
  return diff.code === 0 ? diff.stdout : ''
}

export function describe(record: RunRecord): string {
  return `${record.participantId} / повтор ${record.repeat}`
}

async function baseline(repo: string): Promise<string | undefined> {
  const tag = await run('git', ['rev-parse', '--verify', `${BASELINE_TAG}^{commit}`], { cwd: repo })
  if (tag.code === 0) return tag.stdout.trim()

  const seed = await run('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd: repo })
  return seed.code === 0 ? seed.stdout.trim().split('\n')[0] : undefined
}

/** A request must not be able to name a file outside the run it belongs to. */
export function readInside(root: string, path: string): string | undefined {
  const target = resolve(root, path)
  const inside = relative(resolve(root), target)
  if (inside.startsWith('..') || inside === '') return undefined
  if (!existsSync(target) || !statSync(target).isFile()) return undefined
  if (statSync(target).size > 512 * 1024) return '(файл слишком велик для показа)'

  const text = readFileSync(target)
  return text.includes(0) ? '(двоичный файл)' : text.toString('utf8')
}

function walk(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git') continue
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...walk(join(dir, entry.name), rel))
    else found.push(rel)
  }
  return found
}
