import { join } from 'node:path'

import { costly, findingLine, findingSummary } from '../judge/explain.js'
import { METRIC_TITLES, METRICS, type RunRecord } from '../model/run.js'
import type { Stage } from '../model/stage.js'
import { run } from '../proc.js'
import { BASELINE_TAG } from './participantRun.js'
import { restoreRepo } from '../sandbox/extract.js'

export interface RunFilter {
  tasks?: string[] | undefined
  participants?: string[] | undefined
  stage?: Stage | undefined
  repeat?: number | undefined
}

export interface RestoredRun {
  record: RunRecord
  /** Working tree the run's repository was restored into. */
  dir: string
  /** What the participant changed, against the state it started from. */
  summary: string
}

export function selectRuns(records: RunRecord[], filter: RunFilter): RunRecord[] {
  return records.filter(
    (record) =>
      (filter.tasks === undefined || filter.tasks.includes(record.taskId)) &&
      (filter.participants === undefined || filter.participants.includes(record.participantId)) &&
      (filter.stage === undefined || (record.stage ?? 'full') === filter.stage) &&
      (filter.repeat === undefined || record.repeat === filter.repeat),
  )
}

export function describeRun(record: RunRecord): string {
  return `${record.taskId} / ${record.participantId} / ${record.stage ?? 'full'} / ${record.repeat}`
}

/**
 * Unpacks the repository a run produced. The bundle keeps everything the
 * participant did, history included; this puts it somewhere it can be read.
 */
export async function restoreRun(runDir: string, record: RunRecord, out?: string): Promise<RestoredRun> {
  const dir = out ?? join(runDir, 'repo')
  await restoreRepo(join(runDir, 'repo.bundle'), dir)
  return { record, dir, summary: await summarize(dir) }
}

/**
 * What the participant produced is the difference from the baseline tag — the
 * state after its tooling was installed. Runs made before the tag existed fall
 * back to the seed commit, which also counts the tooling.
 */
async function summarize(dir: string): Promise<string> {
  const from = await baseline(dir)
  if (from === undefined) return ''
  const stat = await run('git', ['diff', '--stat', from, 'HEAD'], { cwd: dir })
  return stat.code === 0 ? stat.stdout.trimEnd() : ''
}

async function baseline(dir: string): Promise<string | undefined> {
  const tag = await run('git', ['rev-parse', '--verify', `${BASELINE_TAG}^{commit}`], { cwd: dir })
  if (tag.code === 0) return tag.stdout.trim()

  const seed = await run('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd: dir })
  return seed.code === 0 ? seed.stdout.trim().split('\n')[0] : undefined
}

/** What the judges said, for reading rather than for scoring. */
export function renderVerdicts(record: RunRecord): string {
  const lines = [describeRun(record)]
  const verdicts = METRICS.map((metric) => record.verdicts[metric]).filter((v) => v !== undefined)

  if (verdicts.length === 0) {
    lines.push('  не оценён')
    return lines.join('\n')
  }

  for (const verdict of verdicts) {
    lines.push('', `${verdict.metric} = ${verdict.score} — ${METRIC_TITLES[verdict.metric]}`)
    const summary = findingSummary(verdict.metric, verdict.findings)
    if (summary) lines.push(summary)
    lines.push(verdict.rationale)

    // Findings that cost nothing are the bulk of the list and say nothing
    // about the score; the whole list stays in `run.json`.
    const lost = verdict.findings.filter(costly)
    if (lost.length > 0) lines.push('чем набран балл:', ...lost.map((f) => `  · ${findingLine(f)}`))
    if (verdict.evidence.length > 0) {
      lines.push('проверки:', ...verdict.evidence.map((item) => `  · ${item}`))
    }
  }
  return lines.join('\n')
}
