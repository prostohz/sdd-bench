import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeCapturedJson } from '../artifacts.js'
import type { BenchConfig } from '../config.js'
import { METRICS, type Metric, type RunRecord, type Verdict } from '../model/run.js'
import type { Task } from '../model/task.js'
import { isRecord } from '../model/validate.js'
import { runClaude } from '../run/claude.js'
import type { SandboxDriver } from '../sandbox/driver.js'
import { restoreRepo } from '../sandbox/extract.js'

const VERDICT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 10 },
    rationale: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'rationale', 'evidence'],
  additionalProperties: false,
})

export interface JudgeContext {
  config: BenchConfig
  driver: SandboxDriver
  /** Where `judges/<metric>.md` lives. */
  root: string
  log: (message: string) => void
}

/**
 * Each metric is judged by a fresh judge that sees only what that metric
 * needs. The participant is never named, and its specification arrives in a
 * neutral `spec/` directory.
 */
export async function judgeRun(
  ctx: JudgeContext,
  task: Task,
  record: RunRecord,
  runDir: string,
): Promise<RunRecord> {
  for (const metric of METRICS) {
    if (record.verdicts[metric]) continue
    ctx.log(`  · ${record.runId} ${metric}`)
    record.verdicts[metric] = await judgeMetric(ctx, task, record, runDir, metric)
  }
  record.versions['judgeModel'] = ctx.config.judgeModel
  writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`)
  return record
}

async function judgeMetric(
  ctx: JudgeContext,
  task: Task,
  record: RunRecord,
  runDir: string,
  metric: Metric,
): Promise<Verdict> {
  const materials = mkdtempSync(join(tmpdir(), 'sdd-bench-judge-'))
  // The rubric is the judge's instructions, not one of its materials.
  const staging = mkdtempSync(join(tmpdir(), 'sdd-bench-rubric-'))
  // Nothing in the sandbox name may hint at who produced the result.
  const name = `judge-${createHash('sha256').update(`${record.runId}:${metric}`).digest('hex').slice(0, 12)}`

  try {
    await layOutMaterials(metric, task, runDir, materials)

    const promptPath = `/tmp/sdd-bench/rubric-${metric}.md`
    const promptFile = join(staging, `rubric-${metric}.md`)
    writeFileSync(promptFile, readFileSync(join(ctx.root, 'judges', `${metric}.md`), 'utf8'))

    const sandbox = await ctx.driver.create({ name, workspace: materials, agent: 'claude', clone: false })
    try {
      await sandbox.allowHosts([...ctx.config.allowHosts, ...task.allowHosts])
      await sandbox.copyIn(promptFile, promptPath)

      const run = await runClaude(sandbox, {
        model: ctx.config.judgeModel,
        effort: ctx.config.judgeEffort,
        promptPath,
        jsonSchema: VERDICT_SCHEMA,
        timeoutMs: ctx.config.judgeTimeoutMs,
      })

      const text = run.result?.text ?? ''
      writeCapturedJson(join(runDir, `judge-${metric}.json`), run.proc.stdout)
      return { ...parseVerdict(text, metric), metric, judgeModel: ctx.config.judgeModel }
    } finally {
      await sandbox.remove()
    }
  } finally {
    rmSync(materials, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
  }
}

/** Only the materials the metric is entitled to, and nothing else. */
async function layOutMaterials(
  metric: Metric,
  task: Task,
  runDir: string,
  materials: string,
): Promise<void> {
  const spec = join(runDir, 'spec')
  mkdirSync(join(materials, 'spec'), { recursive: true })
  if (existsSync(spec)) cpSync(spec, join(materials, 'spec'), { recursive: true })

  if (metric === 'SR') {
    cpSync(join(task.dir, task.intentFile), join(materials, 'intent.md'))
  }
  if (metric === 'IS') {
    await restoreRepo(join(runDir, 'repo.bundle'), join(materials, 'repo'))
  }
}

export function parseVerdict(
  text: string,
  metric: Metric,
): { score: number; rationale: string; evidence: string[] } {
  const parsed = firstJsonObject(text)
  if (!isRecord(parsed) || typeof parsed['score'] !== 'number') {
    throw new Error(`судья ${metric} вернул не оценку, а: ${text.slice(0, 200)}`)
  }
  return {
    score: Math.min(10, Math.max(0, parsed['score'])),
    rationale: typeof parsed['rationale'] === 'string' ? parsed['rationale'] : '',
    evidence: Array.isArray(parsed['evidence']) ? parsed['evidence'].map(String) : [],
  }
}

function firstJsonObject(text: string): unknown {
  const trimmed = text.trim()
  for (let start = trimmed.indexOf('{'); start !== -1; start = trimmed.indexOf('{', start + 1)) {
    for (let end = trimmed.lastIndexOf('}'); end > start; end = trimmed.lastIndexOf('}', end - 1)) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        // Not a complete object between these braces; narrow the window.
      }
    }
  }
  return undefined
}
