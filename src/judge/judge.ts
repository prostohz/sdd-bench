import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeCapturedJson } from '../artifacts.js'
import type { BenchConfig } from '../config.js'
import { parseRequirements, type Requirement } from '../model/requirements.js'
import {
  COVERAGE_RULINGS,
  IMPL_RULINGS,
  QUALITY_AXES,
  SEVERITIES,
  type Finding,
  type Metric,
  type RunRecord,
  type Verdict,
} from '../model/run.js'
import { DEFAULT_STAGE, STAGE_METRICS } from '../model/stage.js'
import type { Task } from '../model/task.js'
import { isRecord } from '../model/validate.js'
import { tally } from './tally.js'
import { providerHosts, runAgent, type AgentRun } from '../run/agent.js'
import type { SandboxDriver } from '../sandbox/driver.js'
import { restoreRepo } from '../sandbox/extract.js'

/** Judges name items and rule on them; the number is the harness's business. */
const IMPL_MIN_REQUIREMENTS = 5

function object(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

function list(properties: Record<string, unknown>, bounds: Record<string, number> = {}): Record<string, unknown> {
  return { type: 'array', items: object(properties), ...bounds }
}

const WHERE = { type: 'string' }
const NOTE = { type: 'string' }
const SEVERITY = { type: 'string', enum: SEVERITIES }

/**
 * What the judge of a metric is allowed to answer. The shape is the rubric
 * made mechanical: a ruling per item, drawn from a fixed vocabulary, and no
 * place at all to write an overall impression as a number.
 */
export function verdictSchema(metric: Metric, ids: string[]): string {
  if (metric === 'spec-fit') {
    return JSON.stringify(
      object({
        requirements: list(
          { id: { type: 'string', enum: ids }, ruling: { type: 'string', enum: COVERAGE_RULINGS }, where: WHERE, note: NOTE },
          { minItems: ids.length, maxItems: ids.length },
        ),
        additions: list({ what: { type: 'string' }, severity: SEVERITY, where: WHERE, note: NOTE }),
        rationale: { type: 'string' },
      }),
    )
  }

  if (metric === 'spec-quality') {
    return JSON.stringify(
      object({
        defects: list({
          axis: { type: 'string', enum: QUALITY_AXES },
          what: { type: 'string' },
          severity: SEVERITY,
          where: WHERE,
          note: NOTE,
        }),
        rationale: { type: 'string' },
      }),
    )
  }

  return JSON.stringify(
    object({
      requirements: list(
        { statement: { type: 'string' }, ruling: { type: 'string', enum: IMPL_RULINGS }, where: WHERE, note: NOTE },
        { minItems: IMPL_MIN_REQUIREMENTS },
      ),
      contradictions: list({ what: { type: 'string' }, severity: SEVERITY, where: WHERE, note: NOTE }),
      checks: { type: 'array', items: { type: 'string' } },
      rationale: { type: 'string' },
    }),
  )
}

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
  /**
   * The checklist a `spec-fit` judge rules against, item by item. Its wording
   * reaches the judge as a material; here it constrains the answer and fills
   * the findings back in, so no requirement is quietly skipped or invented.
   */
  requirements?: Requirement[]
  /** Leave the sandbox behind so it can be opened by hand. */
  keepSandbox?: boolean
}

export interface JudgeAnswer {
  sandboxName: string
  cliVersion: string | undefined
  run: AgentRun
  verdict: Verdict | undefined
  /** Why the answer is not a verdict, when it is not one. */
  parseError: string | undefined
}

export function readRubric(root: string, metric: Metric): string {
  return readFileSync(join(root, 'judges', `${metric}.md`), 'utf8')
}

/** The name the checklist has inside the judge's workspace, and in a probe's. */
export const REQUIREMENTS_FILE = 'requirements.md'

export function readRequirements(task: Task): Requirement[] {
  return parseRequirements(readFileSync(join(task.dir, task.requirementsFile), 'utf8'))
}

/**
 * One judgement, from materials to verdict. Everything a judge sees is here:
 * the workspace it is given, the rubric it is handed and the hosts it may
 * reach — so a debugging call and a real one take the same path.
 */
export async function askJudge(ctx: JudgeContext, request: JudgeRequest): Promise<JudgeAnswer> {
  const staging = mkdtempSync(join(tmpdir(), 'sdd-bench-rubric-'))
  const requirements = request.requirements ?? []
  try {
    const promptPath = `/tmp/sdd-bench/rubric-${request.metric}.md`
    const promptFile = join(staging, `rubric-${request.metric}.md`)
    writeFileSync(promptFile, request.rubric)

    const sandbox = await ctx.driver.create({
      name: request.sandboxName,
      workspace: request.materials,
      agent: ctx.config.provider,
      clone: false,
    })
    try {
      await sandbox.allowHosts([...providerHosts(ctx.config.provider), ...request.allowHosts])
      await sandbox.copyIn(promptFile, promptPath)
      const version = await sandbox.exec(`${ctx.config.provider} --version`, { timeoutMs: 2 * 60 * 1000 })
      const cliVersion = version.code === 0 ? version.stdout.trim() : undefined

      const run = await runAgent(sandbox, ctx.config.provider, {
        model: ctx.config.judgeModel,
        effort: ctx.config.judgeEffort,
        promptPath,
        jsonSchema: verdictSchema(request.metric, requirements.map((r) => r.id)),
        timeoutMs: ctx.config.judgeTimeoutMs,
      })

      try {
        if (run.proc.code !== 0 || run.result?.isError || run.parseError) {
          throw new Error(run.parseError || run.result?.text || run.proc.stderr || 'судья завершился без ответа')
        }
        const parsed = parseVerdict(run.result?.text ?? '', request.metric, requirements)
        return {
          sandboxName: sandbox.name,
          cliVersion,
          run,
          verdict: { ...parsed, metric: request.metric, judgeModel: ctx.config.judgeModel },
          parseError: undefined,
        }
      } catch (error) {
        return {
          sandboxName: sandbox.name,
          cliVersion,
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
  /** Ask again where a verdict already exists — a rubric that changed wants it. */
  rejudge = false,
): Promise<RunRecord> {
  for (const metric of STAGE_METRICS[record.stage ?? DEFAULT_STAGE]) {
    if (record.verdicts[metric] && !rejudge) continue
    ctx.log(`  · ${record.runId} ${metric}`)

    // A judge that answers unreadably costs its own metric and nothing else:
    // the run keeps its other verdicts, the ones after it still get judged,
    // and `judge --result <id>` fills the gap without repeating what worked.
    try {
      record.verdicts[metric] = await judgeMetric(ctx, task, record, runDir, metric)
    } catch (error) {
      ctx.log(`    не оценено: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  record.versions['judgeModel'] = ctx.config.judgeModel
  writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`)
  return record
}

/**
 * Verdicts re-derived from answers already given. What the judge ruled is the
 * expensive part and it is kept beside every run; the arithmetic over those
 * rulings is not, so changing what a ruling is worth costs nothing to apply to
 * results already taken — and changes no result's rulings while doing it.
 */
export function rescoreRun(
  root: string,
  task: Task,
  record: RunRecord,
  runDir: string,
): Metric[] {
  const rescored: Metric[] = []

  for (const metric of STAGE_METRICS[record.stage ?? DEFAULT_STAGE]) {
    const path = join(runDir, `judge-${metric}.json`)
    if (!existsSync(path)) continue

    const saved: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const answer = isRecord(saved) ? saved['result'] : undefined
    if (answer === undefined) continue

    const text = typeof answer === 'string' ? answer : JSON.stringify(answer)
    const parsed = parseVerdict(text, metric, metric === 'spec-fit' ? readRequirements(task) : [])
    record.verdicts[metric] = {
      ...parsed,
      metric,
      judgeModel: record.verdicts[metric]?.judgeModel ?? record.versions['judgeModel'] ?? '',
    }
    rescored.push(metric)
  }

  if (rescored.length > 0) writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`)
  return rescored
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
      requirements: metric === 'spec-fit' ? readRequirements(task) : [],
    })

    writeCapturedJson(join(runDir, `judge-${metric}.json`), answer.run.proc.stdout)
    if (answer.cliVersion) record.versions['judgeCli'] = answer.cliVersion
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
    cpSync(join(task.dir, task.requirementsFile), join(materials, REQUIREMENTS_FILE))
  }
  if (metric === 'impl-fit') {
    await restoreRepo(join(runDir, 'repo.bundle'), join(materials, 'repo'))
  }
}

export interface ParsedVerdict {
  score: number
  rationale: string
  findings: Finding[]
  evidence: string[]
}

/**
 * The judge's answer, read as rulings rather than as a number. An answer that
 * skips items of a checklist it was given is not a low score but no verdict at
 * all: the judge is re-asked rather than the participant charged for it.
 */
export function parseVerdict(text: string, metric: Metric, requirements: Requirement[] = []): ParsedVerdict {
  const parsed = firstJsonObject(text)
  if (!isRecord(parsed)) throw new Error(`судья ${metric} вернул не вердикт, а: ${text.slice(0, 200)}`)

  const findings =
    metric === 'spec-quality'
      ? defectFindings(parsed, metric)
      : [...requirementFindings(parsed, metric, requirements), ...additionFindings(parsed, metric)]

  const checks = parsed['checks']
  const evidence = Array.isArray(checks) ? checks.filter((check) => typeof check === 'string') : []
  return {
    score: tally(metric, findings),
    rationale: typeof parsed['rationale'] === 'string' ? parsed['rationale'] : '',
    findings,
    evidence,
  }
}

function requirementFindings(parsed: Record<string, unknown>, metric: Metric, requirements: Requirement[]): Finding[] {
  const rulings = metric === 'impl-fit' ? IMPL_RULINGS : COVERAGE_RULINGS
  const stated = new Map(requirements.map((requirement) => [requirement.id, requirement.text]))

  const findings = rows(parsed['requirements']).map((row, index) => {
    const id = field(row, 'id') || `${index + 1}`
    return {
      kind: 'requirement' as const,
      item: id,
      statement: stated.get(id) ?? field(row, 'statement'),
      ruling: expect(field(row, 'ruling'), rulings, metric, `требование ${id}`),
      where: field(row, 'where'),
      note: field(row, 'note'),
    }
  })

  if (requirements.length > 0) {
    const ruled = new Set(findings.map((finding) => finding.item))
    const skipped = requirements.filter((requirement) => !ruled.has(requirement.id))
    if (skipped.length > 0) {
      throw new Error(`судья ${metric} не вынес решения по требованиям: ${skipped.map((r) => r.id).join(', ')}`)
    }
    if (ruled.size !== findings.length) {
      throw new Error(`судья ${metric} вынес по одному требованию несколько решений`)
    }
  } else if (findings.length === 0) {
    throw new Error(`судья ${metric} не назвал ни одного требования`)
  }

  return findings
}

function additionFindings(parsed: Record<string, unknown>, metric: Metric): Finding[] {
  const kind = metric === 'impl-fit' ? ('contradiction' as const) : ('addition' as const)
  const source = metric === 'impl-fit' ? parsed['contradictions'] : parsed['additions']
  return rows(source).map((row) => ({
    kind,
    item: field(row, 'what'),
    statement: '',
    ruling: expect(field(row, 'severity'), SEVERITIES, metric, field(row, 'what')),
    where: field(row, 'where'),
    note: field(row, 'note'),
  }))
}

function defectFindings(parsed: Record<string, unknown>, metric: Metric): Finding[] {
  return rows(parsed['defects']).map((row) => ({
    kind: 'defect' as const,
    item: expect(field(row, 'axis'), QUALITY_AXES, metric, field(row, 'what')),
    statement: field(row, 'what'),
    ruling: expect(field(row, 'severity'), SEVERITIES, metric, field(row, 'what')),
    where: field(row, 'where'),
    note: field(row, 'note'),
  }))
}

/** A ruling outside the vocabulary would score as zero in silence; it throws. */
function expect(value: string, allowed: readonly string[], metric: Metric, about: string): string {
  if (!allowed.includes(value)) {
    throw new Error(`судья ${metric} ответил "${value}" про «${about}»; ожидалось одно из: ${allowed.join(', ')}`)
  }
  return value
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function field(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  return typeof value === 'string' ? value.trim() : ''
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
