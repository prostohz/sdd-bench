import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize } from 'node:path'

import { writeCapturedJson } from '../artifacts.js'
import { parseRequirements } from '../model/requirements.js'
import { METRIC_TITLES, type Finding, type Metric, type Telemetry } from '../model/run.js'
import { costly, findingLine, findingSummary } from './explain.js'
import { askJudge, readRubric, REQUIREMENTS_FILE, type JudgeContext } from './judge.js'

/** One thing the judge is allowed to see, and the name it sees it under. */
export interface Material {
  /** Path inside the judge's workspace, e.g. `spec` or `intent.md`. */
  name: string
  /** Where it is taken from on this machine. */
  source: string
}

export interface ProbeOptions {
  metric: Metric
  /** A rubric of one's own; the metric's own rubric when absent. */
  rubricPath: string | undefined
  materials: Material[]
  repeats: number
  outDir: string
  keepSandbox: boolean
}

export interface ProbeAttempt {
  attempt: number
  sandboxName: string
  score: number | undefined
  rationale: string
  findings: Finding[]
  evidence: string[]
  /** What went wrong instead of a verdict. */
  error: string | undefined
  telemetry: Telemetry | undefined
}

export interface ScoreSpread {
  count: number
  min: number
  max: number
  mean: number
  /** max − min: how much the same materials moved the same judge. */
  spread: number
}

export interface ProbeReport {
  metric: Metric
  rubricPath: string
  judgeModel: string
  judgeEffort: string
  materials: { name: string; source: string; files: number }[]
  attempts: ProbeAttempt[]
  spread: ScoreSpread | undefined
  outDir: string
}

/**
 * Puts a judge in front of exactly the materials it is given and reports what
 * it says — as many times as asked, because a rubric that answers differently
 * on the same materials is a finding of its own.
 */
export async function probeJudge(ctx: JudgeContext, options: ProbeOptions): Promise<ProbeReport> {
  const workspace = mkdtempSync(join(tmpdir(), 'sdd-bench-probe-'))
  const rubricPath = options.rubricPath ?? join(ctx.root, 'judges', `${options.metric}.md`)
  const rubric = options.rubricPath ? readFileSync(options.rubricPath, 'utf8') : readRubric(ctx.root, options.metric)

  try {
    for (const material of options.materials) placeMaterial(material, workspace)

    // A checklist handed in as a material binds the probe's judge exactly as
    // it binds a real one, so the two are asked the same question.
    const checklist = join(workspace, REQUIREMENTS_FILE)
    const requirements = existsSync(checklist) ? parseRequirements(readFileSync(checklist, 'utf8')) : []

    // The probe directory is the record of the experiment: what the judge saw
    // is kept beside what it answered, or the answer cannot be read later.
    mkdirSync(options.outDir, { recursive: true })
    cpSync(workspace, join(options.outDir, 'materials'), { recursive: true })
    writeFileSync(join(options.outDir, 'rubric.md'), rubric)

    const attempts: ProbeAttempt[] = []
    for (let attempt = 1; attempt <= options.repeats; attempt += 1) {
      ctx.log(`  · ${options.metric} попытка ${attempt}/${options.repeats}`)
      const answer = await askJudge(ctx, {
        metric: options.metric,
        rubric,
        materials: workspace,
        allowHosts: ctx.config.allowHosts,
        sandboxName: sandboxName(options, attempt),
        requirements,
        keepSandbox: options.keepSandbox,
      })

      writeCapturedJson(join(options.outDir, `attempt-${attempt}.json`), answer.run.proc.stdout)
      attempts.push({
        attempt,
        sandboxName: answer.sandboxName,
        score: answer.verdict?.score,
        rationale: answer.verdict?.rationale ?? '',
        findings: answer.verdict?.findings ?? [],
        evidence: answer.verdict?.evidence ?? [],
        error: answer.parseError ?? answer.run.parseError,
        telemetry: answer.run.result?.telemetry,
      })
    }

    const report: ProbeReport = {
      metric: options.metric,
      rubricPath,
      judgeModel: ctx.config.judgeModel,
      judgeEffort: ctx.config.judgeEffort,
      materials: options.materials.map((material) => ({
        ...material,
        files: countFiles(join(workspace, material.name)),
      })),
      attempts,
      spread: spreadOf(attempts.map((a) => a.score)),
      outDir: options.outDir,
    }
    writeFileSync(join(options.outDir, 'probe.json'), `${JSON.stringify(report, null, 2)}\n`)
    return report
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

/** `spec=./path` — the name the judge sees, and where it comes from. */
export function parseMaterial(spec: string): Material {
  const at = spec.indexOf('=')
  const [name, source] = at === -1 ? [basename(spec), spec] : [spec.slice(0, at), spec.slice(at + 1)]

  if (name === '' || source === '') throw new Error(`--material: ожидается имя=путь, а не "${spec}"`)
  if (isAbsolute(name) || normalize(name).split('/').includes('..')) {
    throw new Error(`--material: имя "${name}" должно быть путём внутри материалов судьи`)
  }
  if (!existsSync(source)) throw new Error(`--material: не найдено: ${source}`)
  return { name: normalize(name), source }
}

/** Named sandboxes, distinct per attempt, telling nothing about the materials. */
function sandboxName(options: ProbeOptions, attempt: number): string {
  const seed = `${options.metric}:${options.outDir}:${attempt}`
  return `judge-probe-${createHash('sha256').update(seed).digest('hex').slice(0, 10)}`
}

function placeMaterial(material: Material, workspace: string): void {
  const target = join(workspace, material.name)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(material.source, target, { recursive: true })
}

export function spreadOf(scores: (number | undefined)[]): ScoreSpread | undefined {
  const values = scores.filter((score): score is number => score !== undefined)
  if (values.length === 0) return undefined
  const min = Math.min(...values)
  const max = Math.max(...values)
  return {
    count: values.length,
    min,
    max,
    mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    spread: Number((max - min).toFixed(2)),
  }
}

export function renderProbe(report: ProbeReport): string {
  const lines = [
    `${report.metric} — ${METRIC_TITLES[report.metric]}`,
    `рубрика: ${report.rubricPath}`,
    `судья: ${report.judgeModel} / ${report.judgeEffort}`,
    'материалы:',
    ...(report.materials.length === 0
      ? ['  — (судья не видит ничего)']
      : report.materials.map((m) => `  · ${m.name} ← ${m.source} (${m.files} ф.)`)),
  ]

  for (const attempt of report.attempts) {
    lines.push('', `попытка ${attempt.attempt}: ${attempt.score ?? '—'}${attempt.error ? ` (${attempt.error})` : ''}`)
    const summary = findingSummary(report.metric, attempt.findings)
    if (summary) lines.push(summary)
    if (attempt.rationale) lines.push(attempt.rationale)

    const lost = attempt.findings.filter(costly)
    if (lost.length > 0) lines.push('чем набран балл:', ...lost.map((f) => `  · ${findingLine(f)}`))
    if (attempt.evidence.length > 0) lines.push('проверки:', ...attempt.evidence.map((item) => `  · ${item}`))
  }

  if (report.spread) {
    const { count, min, max, mean, spread } = report.spread
    lines.push('', `оценок ${count}: min ${min}, max ${max}, среднее ${mean}, разброс ${spread}`)
  }
  lines.push('', `материалы и ответы: ${report.outDir}`)
  return lines.join('\n')
}

function countFiles(path: string): number {
  if (!existsSync(path)) return 0
  if (!statSync(path).isDirectory()) return 1

  let count = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    count += entry.isDirectory() ? countFiles(join(path, entry.name)) : 1
  }
  return count
}
