import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeCapturedJson } from '../artifacts.js'
import type { BenchConfig } from '../config.js'
import { type Metric, type RunRecord, type Verdict } from '../model/run.js'
import { DEFAULT_STAGE, STAGE_METRICS } from '../model/stage.js'
import type { Task } from '../model/task.js'
import { isRecord } from '../model/validate.js'
import { runClaude, type ClaudeRun } from '../run/claude.js'
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

export interface JudgeRequest {
  metric: Metric
  /** The rubric's text: the judge's instructions, not one of its materials. */
  rubric: string
  /** Host directory that becomes the judge's whole world. */
  materials: string
  allowHosts: string[]
  sandboxName: string
  /** Leave the sandbox behind so it can be opened by hand. */
  keepSandbox?: boolean
}

export interface JudgeAnswer {
  sandboxName: string
  run: ClaudeRun
  verdict: Verdict | undefined
  /** Why the answer is not a verdict, when it is not one. */
  parseError: string | undefined
}

export function readRubric(root: string, metric: Metric): string {
  return readFileSync(join(root, 'judges', `${metric}.md`), 'utf8')
}

/**
 * One judgement, from materials to verdict. Everything a judge sees is here:
 * the workspace it is given, the rubric it is handed and the hosts it may
 * reach — so a debugging call and a real one take the same path.
 */
export async function askJudge(ctx: JudgeContext, request: JudgeRequest): Promise<JudgeAnswer> {
  const staging = mkdtempSync(join(tmpdir(), 'sdd-bench-rubric-'))
  try {
    const promptPath = `/tmp/sdd-bench/rubric-${request.metric}.md`
    const promptFile = join(staging, `rubric-${request.metric}.md`)
    writeFileSync(promptFile, request.rubric)

    const sandbox = await ctx.driver.create({
      name: request.sandboxName,
      workspace: request.materials,
      agent: 'claude',
      clone: false,
    })
    try {
      await sandbox.allowHosts(request.allowHosts)
      await sandbox.copyIn(promptFile, promptPath)

      const run = await runClaude(sandbox, {
        model: ctx.config.judgeModel,
        effort: ctx.config.judgeEffort,
        promptPath,
        jsonSchema: VERDICT_SCHEMA,
        timeoutMs: ctx.config.judgeTimeoutMs,
      })

      try {
        const parsed = parseVerdict(run.result?.text ?? '', request.metric)
        return {
          sandboxName: sandbox.name,
          run,
          verdict: { ...parsed, metric: request.metric, judgeModel: ctx.config.judgeModel },
          parseError: undefined,
        }
      } catch (error) {
        return {
          sandboxName: sandbox.name,
          run,
          verdict: undefined,
          parseError: error instanceof Error ? error.message : String(error),
        }
      }
    } finally {
      if (request.keepSandbox !== true) await sandbox.remove()
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
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
  for (const metric of STAGE_METRICS[record.stage ?? DEFAULT_STAGE]) {
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
  // Nothing in the sandbox name may hint at who produced the result.
  const name = `judge-${createHash('sha256').update(`${record.runId}:${metric}`).digest('hex').slice(0, 12)}`

  try {
    await layOutMaterials(metric, task, runDir, materials)

    const answer = await askJudge(ctx, {
      metric,
      rubric: readRubric(ctx.root, metric),
      materials,
      allowHosts: [...ctx.config.allowHosts, ...task.allowHosts],
      sandboxName: name,
    })

    writeCapturedJson(join(runDir, `judge-${metric}.json`), answer.run.proc.stdout)
    if (answer.verdict === undefined) throw new Error(answer.parseError ?? `судья ${metric} не ответил`)
    return answer.verdict
  } finally {
    rmSync(materials, { recursive: true, force: true })
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

  if (metric === 'spec-fit') {
    cpSync(join(task.dir, task.intentFile), join(materials, 'intent.md'))
  }
  if (metric === 'impl-fit') {
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
