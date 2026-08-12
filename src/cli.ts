#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { findParticipant, findTask, loadCatalog, type Catalog } from './catalog.js'
import { loadConfig, type BenchConfig } from './config.js'
import { DEFAULT_STAGE, isStage, STAGES, type Stage } from './model/stage.js'
import { judgeRun, rescoreRun } from './judge/judge.js'
import { parseMaterial, probeJudge, renderProbe } from './judge/probe.js'
import { METRICS, type Metric } from './model/run.js'

import type { Participant } from './model/participant.js'
import type { Task } from './model/task.js'
import { agentHint, checkAgent } from './run/doctor.js'
import { runParticipant } from './run/participantRun.js'
import { describeRun, renderVerdicts, restoreRun, selectRuns } from './run/showRun.js'
import { serve } from './web/server.js'
import { renderReport } from './report/report.js'
import {
  createResult,
  newResultId,
  readManifest,
  readRunEntries,
  resolveResult,
  resultsRoot,
} from './results.js'
import { DryRunDriver } from './sandbox/dryRun.js'
import { SbxDriver } from './sandbox/sbx.js'
import type { SandboxDriver } from './sandbox/driver.js'
import { scoreParticipants, scoreRun } from './score/score.js'

const USAGE = `sdd-bench — бенчмарк инструментов spec-driven development

  sdd-bench validate                    проверить каталог задач и участников
  sdd-bench doctor                      проверить, что агент в sandbox отвечает
  sdd-bench run [опции]                 прогнать участников и сохранить артефакты
  sdd-bench judge [опции]               оценить сохранённые запуски
  sdd-bench judge-probe [опции]         прогнать судью на указанных материалах
  sdd-bench score [опции]               посчитать скоры
  sdd-bench report [опции]              собрать отчёт
  sdd-bench show [опции]                развернуть репозиторий запуска для просмотра
  sdd-bench verdicts [опции]            прочитать обоснования судей
  sdd-bench serve [--port N]            локальный просмотр результатов в браузере
  sdd-bench all [опции]                 run + judge + report

Опции:
  --task <id,...>         задачи (по умолчанию все)
  --participant <id,...>  участники (по умолчанию все)
  -n, --repeats <N>       число повторов
  --result <id|path>      каталог результата (по умолчанию последний)
  --config <path>         файл настроек (по умолчанию bench.json)
  --out <path>            куда записать отчёт или развернуть репозиторий
  --repeat <N>            номер повтора (для show и verdicts)
  --port <N>              порт для serve (по умолчанию 7777)
  --stage <full|spec>     этап цикла: полностью или только спецификация
  --rejudge               спросить судей заново там, где вердикт уже есть
  --rescore               пересчитать баллы по сохранённым ответам судей
  --retry-failed          переснять запуски результата, не дошедшие до конца
  --dry-run               холостой прогон без sandbox и обращений к API
  --skip-doctor           не проверять агента перед прогоном

Опции judge-probe:
  --metric <spec-quality|spec-fit|impl-fit>
                          что оценивать (по умолчанию spec-quality)
  --rubric <path>         своя рубрика вместо judges/<metric>.md
  --material <имя=путь>   что видит судья; можно повторять
  -n, --repeats <N>       сколько раз спросить одно и то же (разброс оценок)
  --keep-sandbox          не удалять sandbox судьи после ответа
  --out <path>            куда сложить материалы и ответы
`

interface Options {
  command: string
  tasks: string[] | undefined
  participants: string[] | undefined
  repeats: number | undefined
  result: string | undefined
  config: string | undefined
  out: string | undefined
  stage: Stage | undefined
  repeat: number | undefined
  port: number | undefined
  metric: Metric | undefined
  rubric: string | undefined
  materials: string[]
  keepSandbox: boolean
  rejudge: boolean
  rescore: boolean
  retryFailed: boolean
  dryRun: boolean
  skipDoctor: boolean
}

async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv)
  if (options.command === 'help') {
    process.stdout.write(USAGE)
    return 0
  }

  const root = process.cwd()
  const config = withOverrides(loadConfig(root, options.config), options)

  switch (options.command) {
    case 'validate':
      return validate(root)
    case 'doctor':
      return doctor(config, options)
    case 'run':
      await runCommand(root, config, options)
      return 0
    case 'judge':
      await judgeCommand(root, config, options, resolveResult(root, config, options.result))
      return 0
    case 'judge-probe':
      await judgeProbeCommand(root, config, options)
      return 0
    case 'score':
      scoreCommand(root, config, options)
      return 0
    case 'report':
      reportCommand(root, config, options, resolveResult(root, config, options.result))
      return 0
    case 'show':
      return showCommand(root, config, options)
    case 'verdicts':
      return verdictsCommand(root, config, options)
    case 'serve': {
      const url = await serve({ root, config, port: options.port ?? 7777, host: '127.0.0.1' })
      process.stdout.write(`${url}\n`)
      // The server owns the process from here; nothing follows.
      await new Promise(() => {})
      return 0
    }
    case 'all': {
      const resultDir = await runCommand(root, config, options)
      await judgeCommand(root, config, options, resultDir)
      reportCommand(root, config, options, resultDir)
      return 0
    }
    default:
      process.stderr.write(`неизвестная команда "${options.command}"\n\n${USAGE}`)
      return 2
  }
}

function validate(root: string): number {
  const catalog = loadCatalog(root)
  process.stdout.write(
    `задач: ${catalog.tasks.length} (${catalog.tasks.map((t) => t.id).join(', ') || '—'})\n` +
      `участников: ${catalog.participants.length} (${catalog.participants.map((p) => p.id).join(', ') || '—'})\n`,
  )
  return catalog.tasks.length > 0 && catalog.participants.length > 0 ? 0 : 1
}

async function doctor(config: BenchConfig, options: Options): Promise<number> {
  const driver = makeDriver(options)
  for (const warning of await driver.preflight()) log(`⚠ ${warning}`)

  const failure = await checkAgent(driver, config)
  if (failure === undefined) {
    process.stdout.write('агент отвечает\n')
    return 0
  }
  process.stderr.write(`${failure}\n\n${agentHint(failure)}\n`)
  return 1
}

/** One participant on one task, once. */
interface Job {
  task: Task
  participant: Participant
  repeat: number
  stage: Stage
}

/**
 * The runs of a result that never finished. A sandbox that lost its connection
 * or an agent that failed to authenticate says nothing about the process being
 * measured, and re-taking those runs is not the same as re-taking the result:
 * everything that did finish is left exactly as it was.
 */
function failedJobs(catalog: Catalog, resultDir: string, options: Options): Job[] {
  const records = selectRuns(
    readRunEntries(resultDir).map((e) => e.record),
    { tasks: options.tasks, participants: options.participants, repeat: options.repeat },
  )

  return records
    .filter((record) => record.status !== 'ok')
    .map((record) => ({
      task: findTask(catalog, record.taskId),
      participant: findParticipant(catalog, record.participantId),
      repeat: record.repeat,
      stage: record.stage ?? DEFAULT_STAGE,
    }))
}

async function runCommand(root: string, config: BenchConfig, options: Options): Promise<string> {
  const catalog = loadCatalog(root)
  const tasks = options.tasks?.map((id) => findTask(catalog, id)) ?? catalog.tasks
  const participants = options.participants?.map((id) => findParticipant(catalog, id)) ?? catalog.participants
  const driver = makeDriver(options)

  if (options.retryFailed && options.result === undefined) {
    throw new Error('--retry-failed: укажите --result — переснимать нечего, пока нет результата')
  }

  for (const warning of await driver.preflight()) log(`⚠ ${warning}`)

  if (!options.skipDoctor) {
    log('проверка агента…')
    const failure = await checkAgent(driver, config)
    if (failure) throw new Error(`${failure}\n\n${agentHint(failure)}\n\nПропустить проверку: --skip-doctor`)
  }

  const resultId = newResultId()
  const resultDir = options.result
    ? resolveResult(root, config, options.result)
    : join(resultsRoot(root, config), resultId)

  // Re-taking failed runs joins a result that already exists; its manifest
  // records the settings the finished runs were taken under and stays put.
  if (!options.retryFailed) {
    createResult(resultDir, resultDir.split('/').at(-1) ?? resultId, config, {
      sandbox: await driver.version(),
    })
  }
  logTo(resultDir)

  const jobs: Job[] = options.retryFailed
    ? failedJobs(catalog, resultDir, options)
    : tasks.flatMap((task) =>
        participants.flatMap((participant) =>
          Array.from({ length: config.repeats }, (_, i) => ({
            task,
            participant,
            repeat: i + 1,
            stage: config.stage,
          })),
        ),
      )

  if (options.retryFailed) {
    log(`пересъёмка: ${resultDir} — запусков ${jobs.length}`)
    if (jobs.length === 0) log('  все запуски дошли до конца, переснимать нечего')
  } else {
    log(`результат: ${resultDir} (этап ${config.stage})`)
  }

  for (const job of jobs) {
    const record = await runParticipant(
      { config: { ...config, stage: job.stage }, driver, resultDir, log },
      job.task,
      job.participant,
      job.repeat,
    )
    log(`  ${record.status}${record.statusDetail ? `: ${record.statusDetail}` : ''}`)
  }

  return resultDir
}

async function judgeCommand(
  root: string,
  config: BenchConfig,
  options: Options,
  resultDir: string,
): Promise<void> {
  const catalog = loadCatalog(root)

  if (options.rescore) {
    logTo(resultDir)
    log(`пересчёт: ${resultDir}`)
    for (const { record, dir } of readRunEntries(resultDir)) {
      const metrics = rescoreRun(root, findTask(catalog, record.taskId), record, dir)
      const scores = metrics.map((m) => `${m}=${record.verdicts[m]?.score}`).join(' ')
      log(`  · ${record.runId} ${scores || 'нечего пересчитывать'}`)
    }
    return
  }

  const driver = makeDriver(options)

  // Выдуманные оценки поверх настоящих не восстановить: холостой прогон вправе
  // дописать недостающие вердикты, но не заменить уже вынесенные.
  if (options.rejudge && driver.kind === 'dry-run') {
    throw new Error('--rejudge затрёт настоящие вердикты выдуманными; уберите --dry-run или --rejudge')
  }

  logTo(resultDir)
  log(`оценка: ${resultDir}`)

  for (const { record, dir } of readRunEntries(resultDir)) {
    if (record.status !== 'ok') {
      log(`  · ${record.runId} пропущен (${record.status})`)
      continue
    }
    await judgeRun(
      { config, driver, root, log },
      findTask(catalog, record.taskId),
      record,
      dir,
      options.rejudge,
    )
  }
}

/**
 * Judging, taken apart: one metric, the materials named on the command line and
 * nothing else, repeated as many times as asked. Nothing here reads a result —
 * a rubric can be tried before there is anything to judge.
 */
async function judgeProbeCommand(root: string, config: BenchConfig, options: Options): Promise<void> {
  const metric = options.metric ?? 'spec-quality'
  const driver = makeDriver(options)
  for (const warning of await driver.preflight()) log(`⚠ ${warning}`)

  const outDir = options.out ?? join(root, 'judge-probes', `${newResultId()}--${metric}`)
  const report = await probeJudge(
    { config, driver, root, log },
    {
      metric,
      rubricPath: options.rubric,
      materials: options.materials.map(parseMaterial),
      repeats: options.repeats ?? 1,
      outDir,
      keepSandbox: options.keepSandbox,
    },
  )

  process.stdout.write(`${renderProbe(report)}\n`)
  if (options.keepSandbox) {
    log(`sandbox не удалён: ${report.attempts.map((a) => a.sandboxName).join(', ')}`)
  }
}

function scoreCommand(root: string, config: BenchConfig, options: Options): void {
  const manifest = readManifest(resolveResult(root, config, options.result))
  process.stdout.write(
    `${JSON.stringify(
      { runs: manifest.runs.map(scoreRun), participants: scoreParticipants(manifest.runs) },
      null,
      2,
    )}\n`,
  )
}

function reportCommand(root: string, config: BenchConfig, options: Options, resultDir: string): void {
  logTo(resultDir)
  const report = renderReport(readManifest(resultDir))
  const out = options.out ?? join(resultDir, 'report.md')
  writeFileSync(out, report)
  process.stdout.write(`${report}\n`)
  log(`отчёт: ${out}`)
}

/** Prints what the judges wrote, for as many runs as the options select. */
function verdictsCommand(root: string, config: BenchConfig, options: Options): number {
  const resultDir = resolveResult(root, config, options.result)
  const entries = readRunEntries(resultDir)
  const chosen = selectRuns(entries.map((e) => e.record), {
    tasks: options.tasks,
    participants: options.participants,
    stage: options.stage,
    repeat: options.repeat,
  })

  if (chosen.length === 0) {
    process.stderr.write(
      `подходящих запусков нет.\nрезультат ${resultDir} содержит:\n` +
        `${entries.map((e) => `  ${describeRun(e.record)}`).join('\n') || '  —'}\n`,
    )
    return 1
  }

  process.stdout.write(`${chosen.map(renderVerdicts).join('\n\n')}\n`)
  return 0
}

/** Unpacks a finished run so its repository can simply be opened. */
async function showCommand(root: string, config: BenchConfig, options: Options): Promise<number> {
  const resultDir = resolveResult(root, config, options.result)
  const entries = readRunEntries(resultDir)
  const chosen = selectRuns(entries.map((e) => e.record), {
    tasks: options.tasks,
    participants: options.participants,
    stage: options.stage,
    repeat: options.repeat,
  })

  // Without --result this is the newest result, not a search across all of
  // them, so naming it is what explains an empty match.
  const where = `результат ${resultDir}`
  if (chosen.length === 0) {
    process.stderr.write(
      `подходящих запусков нет.\n${where} содержит:\n` +
        `${entries.map((e) => `  ${describeRun(e.record)}`).join('\n') || '  —'}\n`,
    )
    return 1
  }
  if (chosen.length > 1) {
    process.stderr.write(
      `подходит несколько запусков — уточните --task, --participant, --stage или --repeat.\n${where}:\n` +
        `${chosen.map((r) => `  ${describeRun(r)}`).join('\n')}\n`,
    )
    return 1
  }

  const record = chosen[0]
  const entry = entries.find((e) => e.record.runId === record?.runId)
  if (record === undefined || entry === undefined) return 1

  const restored = await restoreRun(entry.dir, record, options.out)
  process.stdout.write(`${restored.dir}\n`)
  if (restored.summary) process.stdout.write(`\n${restored.summary}\n`)
  return 0
}

function makeDriver(options: Options): SandboxDriver {
  return options.dryRun ? new DryRunDriver() : new SbxDriver()
}

function withOverrides(config: BenchConfig, options: Options): BenchConfig {
  return {
    ...config,
    ...(options.repeats === undefined ? {} : { repeats: options.repeats }),
    ...(options.stage === undefined ? {} : { stage: options.stage }),
  }
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    command: argv[0] ?? 'help',
    tasks: undefined,
    participants: undefined,
    repeats: undefined,
    result: undefined,
    config: undefined,
    out: undefined,
    stage: undefined,
    repeat: undefined,
    port: undefined,
    metric: undefined,
    rubric: undefined,
    materials: [],
    keepSandbox: false,
    rejudge: false,
    rescore: false,
    retryFailed: false,
    dryRun: false,
    skipDoctor: false,
  }
  if (argv[0] === undefined || ['-h', '--help', 'help'].includes(argv[0])) options.command = 'help'

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = (): string => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg}: ожидается значение`)
      i += 1
      return value
    }
    switch (arg) {
      case '--task':
        options.tasks = next().split(',')
        break
      case '--participant':
        options.participants = next().split(',')
        break
      case '-n':
      case '--repeats':
        options.repeats = Number(next())
        break
      case '--result':
        options.result = next()
        break
      case '--config':
        options.config = next()
        break
      case '--out':
        options.out = next()
        break
      case '--port':
        options.port = Number(next())
        break
      case '--repeat':
        options.repeat = Number(next())
        break
      case '--stage': {
        const value = next()
        if (!isStage(value)) throw new Error(`--stage: ожидается ${STAGES.join(' или ')}`)
        options.stage = value
        break
      }
      case '--metric': {
        const value = next()
        if (!(METRICS as readonly string[]).includes(value)) {
          throw new Error(`--metric: ожидается ${METRICS.join(', ')}`)
        }
        options.metric = value as Metric
        break
      }
      case '--rubric':
        options.rubric = next()
        break
      case '--material':
        options.materials.push(next())
        break
      case '--keep-sandbox':
        options.keepSandbox = true
        break
      case '--rejudge':
        options.rejudge = true
        break
      case '--rescore':
        options.rescore = true
        break
      case '--retry-failed':
        options.retryFailed = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--skip-doctor':
        options.skipDoctor = true
        break
      default:
        throw new Error(`неизвестная опция "${arg}"`)
    }
  }
  return options
}

/**
 * A run outlives the terminal it was started from: hours pass, the output
 * scrolls away or was never watched. Once a result directory exists, every
 * line of progress is kept beside it, stamped with the time it was written —
 * which is also the only record of how long each part took.
 */
let logFile: string | undefined

function logTo(resultDir: string): void {
  logFile = join(resultDir, 'bench.log')
}

function log(message: string): void {
  process.stderr.write(`${message}\n`)
  if (logFile) appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`)
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
