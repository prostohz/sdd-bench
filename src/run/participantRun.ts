import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { resultText, writeCapturedJson } from '../artifacts.js'
import type { BenchConfig } from '../config.js'
import type { Participant } from '../model/participant.js'
import type { Task } from '../model/task.js'
import { runDirName, type RunRecord, type RunStatus, type TestOutcome } from '../model/run.js'
import { producesCode } from '../model/stage.js'
import type { Sandbox, SandboxDriver } from '../sandbox/driver.js'
import { extractResult } from '../sandbox/extract.js'
import { materializeWorkspace } from '../sandbox/workspace.js'
import { shellQuote } from '../shell.js'
import { agentStream } from './agentLog.js'
import { PROMPT_PATH, runClaude, type ClaudeRun } from './claude.js'
import { runTests } from './projectTests.js'

const SETUP_PATH = '/tmp/sdd-bench/setup.sh'

/**
 * A run takes tens of minutes inside a sandbox that is then deleted, and its
 * artefacts only say how it ended. This says how it went: every step, stamped
 * with the time it happened, beside the artefacts it produced.
 */
export type Note = (message: string) => void

function runLog(runDir: string): Note {
  const path = join(runDir, 'run.log')
  return (message) => appendFileSync(path, `${new Date().toISOString()} ${message}\n`)
}

/** Where the participant's own work begins. */
export const BASELINE_TAG = 'sdd-bench-baseline'

export interface RunContext {
  config: BenchConfig
  driver: SandboxDriver
  /** Directory of the result this run belongs to. */
  resultDir: string
  log: (message: string) => void
}

export async function runParticipant(
  ctx: RunContext,
  task: Task,
  participant: Participant,
  repeat: number,
): Promise<RunRecord> {
  const stage = ctx.config.stage
  const promptFile = participant.promptFiles[stage]
  if (promptFile === undefined) {
    throw new Error(`участник "${participant.id}" не объявил промт для этапа "${stage}"`)
  }

  const runId = `${task.id}-${participant.id}-${stage}-${repeat}`
  const runDir = join(
    ctx.resultDir,
    'runs',
    runDirName({ taskId: task.id, stage, participantId: participant.id, repeat }),
  )
  const workspace = join(runDir, 'workspace')
  mkdirSync(runDir, { recursive: true })

  const record: RunRecord = {
    runId,
    taskId: task.id,
    taskClass: task.taskClass,
    stage,
    participantId: participant.id,
    repeat,
    status: 'ok',
    statusDetail: undefined,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    telemetry: undefined,
    baseline: undefined,
    hidden: undefined,
    verdicts: {},
    versions: { model: ctx.config.model, effort: ctx.config.effort, driver: ctx.driver.kind },
  }

  const note = runLog(runDir)
  ctx.log(`▶ ${runId}`)
  note(`запуск ${runId}: ${ctx.config.model}, effort ${ctx.config.effort}, драйвер ${ctx.driver.kind}`)
  await materializeWorkspace(task, workspace)

  note('sandbox: создание')
  const sandbox = await ctx.driver.create({
    name: runId,
    workspace,
    agent: 'claude',
    clone: true,
    readOnlyMounts: Object.values(participant.mounts),
  })

  let bundlePath: string | undefined
  try {
    await sandbox.allowHosts([...ctx.config.allowHosts, ...task.allowHosts, ...participant.allowHosts])
    const repo = await sandbox.repoPath()
    note(`sandbox: готов, репозиторий ${repo}`)

    const setupFailure = await setUp(sandbox, participant, repo, runDir, record, note)
    if (setupFailure) return finish(record, 'error', setupFailure, runDir, workspace, note)

    const promptOnHost = join(runDir, 'prompt.md')
    writeFileSync(promptOnHost, buildPrompt(task, join(participant.dir, promptFile)))
    await sandbox.copyIn(promptOnHost, PROMPT_PATH)

    note(`агент: старт, лимит ${Math.round(ctx.config.timeoutMs / 60000)} мин (диалог в agent.log)`)
    const run = await runClaude(sandbox, {
      model: ctx.config.model,
      effort: ctx.config.effort,
      promptPath: PROMPT_PATH,
      maxBudgetUsd: ctx.config.maxBudgetUsd,
      cwd: repo,
      timeoutMs: ctx.config.timeoutMs,
      onStdout: agentStream(runDir),
    })
    note(`агент: код ${run.proc.code}${describeAgent(run)}`)

    writeCapturedJson(join(runDir, 'agent.json'), run.proc.stdout)
    const said = resultText(run.proc.stdout)
    if (said) writeFileSync(join(runDir, 'agent.md'), said)
    if (run.proc.stderr.trim()) writeFileSync(join(runDir, 'agent.err'), run.proc.stderr)
    record.telemetry = run.result?.telemetry

    const extraction = await extractResult(sandbox, participant, runDir)
    bundlePath = extraction.bundlePath
    note(`извлечение: файлов спецификации ${extraction.specFiles}`)
    if (extraction.specFiles === 0) ctx.log(`  спецификация не найдена в ${participant.specPaths.join(', ')}`)

    if (run.proc.timedOut) return finish(record, 'timeout', 'лимит времени исчерпан', runDir, workspace, note)
    if (run.proc.code !== 0 || run.result?.isError) {
      return finish(record, 'error', agentFailure(run), runDir, workspace, note)
    }
  } finally {
    await sandbox.remove()
    note('sandbox: удалён')
  }

  // Nothing was implemented, so there is nothing to run tests against.
  if (bundlePath && producesCode(stage)) await check(ctx, task, record, bundlePath, runDir, note)
  return finish(record, record.status, record.statusDetail, runDir, workspace, note)
}

async function setUp(
  sandbox: Sandbox,
  participant: Participant,
  repo: string,
  runDir: string,
  record: RunRecord,
  note: Note,
): Promise<string | undefined> {
  if (participant.setupFile) {
    note(`установка: ${participant.setupFile}`)
    await sandbox.copyIn(join(participant.dir, participant.setupFile), SETUP_PATH)
    const setup = await sandbox.exec(`${setupEnv(participant, repo)} bash ${SETUP_PATH}`, {
      timeoutMs: 20 * 60 * 1000,
    })
    writeFileSync(join(runDir, 'setup.log'), `${setup.stdout}\n${setup.stderr}`)
    note(`установка: код ${setup.code} (вывод в setup.log)`)
    if (setup.code !== 0) return `установка инструментария участника завершилась с кодом ${setup.code}`
  }

  if (participant.versionProbe) {
    const probe = await sandbox.exec(participant.versionProbe, { timeoutMs: 2 * 60 * 1000 })
    if (probe.code === 0) record.versions[participant.id] = probe.stdout.trim().split('\n')[0] ?? ''
  }

  const cli = await sandbox.exec('claude --version', { timeoutMs: 2 * 60 * 1000 })
  if (cli.code === 0) record.versions['claude'] = cli.stdout.trim()

  const versions = Object.entries(record.versions).map(([k, v]) => `${k}=${v.slice(0, 60)}`)
  note(`версии: ${versions.join(', ')}`)
  await markBaseline(sandbox, repo)
  return undefined
}

/**
 * Everything the participant's tooling installed is committed and tagged
 * before the agent starts. What the participant itself produced is then the
 * difference from that tag — no list of directories to keep in step with, and
 * nothing lost, because the tag travels in the bundle.
 */
async function markBaseline(sandbox: Sandbox, repo: string): Promise<void> {
  await sandbox.exec(
    [
      `cd ${shellQuote(repo)}`,
      'git add --all',
      'git -c user.name=sdd-bench -c user.email=bench@localhost commit --quiet ' +
        '--allow-empty --message "sdd-bench: tooling installed"',
      `git tag --force ${BASELINE_TAG}`,
    ].join(' && '),
  )
}

/** Regressions, then the hidden tests, both outside the participant's sandbox. */
async function check(
  ctx: RunContext,
  task: Task,
  record: RunRecord,
  bundlePath: string,
  runDir: string,
  note: Note,
): Promise<void> {
  const common = {
    driver: ctx.driver,
    bundlePath,
    task,
    allowHosts: [...ctx.config.allowHosts, ...task.allowHosts],
    timeoutMs: ctx.config.judgeTimeoutMs,
  }

  if (task.baselineTests) {
    note('тесты: базовые')
    record.baseline = await runTests({
      ...common,
      sandboxName: `${record.runId}-baseline`,
      suite: task.baselineTests,
    })
    writeFileSync(join(runDir, 'baseline.log'), record.baseline.output)
    note(`тесты: базовые — ${describeTests(record.baseline)}`)
  }

  if (task.hiddenTests) {
    note('тесты: скрытые')
    record.hidden = await runTests({
      ...common,
      sandboxName: `${record.runId}-hidden`,
      suite: task.hiddenTests,
      overlayDir: join(task.dir, task.hiddenTests.dir),
    })
    writeFileSync(join(runDir, 'hidden.log'), record.hidden.output)
    note(`тесты: скрытые — ${describeTests(record.hidden)}`)
  }
}

/** What the agent's own numbers say about the invocation that just ended. */
function describeAgent(run: ClaudeRun): string {
  const t = run.result?.telemetry
  if (!t) return run.proc.timedOut ? ', лимит времени исчерпан' : ''
  const parts = [`${Math.round(t.activeMs / 1000)} с`, `${t.numTurns ?? '—'} ходов`, `${t.totalTokens} токенов`]
  if (t.costUsd !== undefined) parts.push(`$${t.costUsd.toFixed(2)}`)
  if (run.proc.timedOut) parts.push('лимит времени исчерпан')
  return `, ${parts.join(', ')}`
}

function describeTests(outcome: TestOutcome): string {
  return `код ${outcome.exitCode}, прошло ${Math.round(outcome.passRatio * 100)}%`
}

/** What actually went wrong, not the envelope's `subtype`, which says `success`. */
function agentFailure(run: ClaudeRun): string {
  const said = run.result?.text.trim()
  if (run.parseError) return run.parseError
  if (said) return said.length > 300 ? `${said.slice(0, 300)}…` : said
  return `claude завершился с кодом ${run.proc.code}`
}

/** The setup script learns where the repository and the mounts are. */
function setupEnv(participant: Participant, repo: string): string {
  const vars = [`SDD_REPO=${shellQuote(repo)}`]
  for (const [name, path] of Object.entries(participant.mounts)) {
    vars.push(`SDD_MOUNT_${name.toUpperCase().replaceAll('-', '_')}=${shellQuote(path)}`)
  }
  return vars.join(' ')
}

function buildPrompt(task: Task, promptPath: string): string {
  const intent = readFileSync(join(task.dir, task.intentFile), 'utf8').trim()
  return readFileSync(promptPath, 'utf8').replaceAll('{{intent}}', intent)
}

function finish(
  record: RunRecord,
  status: RunStatus,
  detail: string | undefined,
  runDir: string,
  workspace: string,
  note: Note,
): RunRecord {
  record.status = status
  record.statusDetail = detail
  record.finishedAt = new Date().toISOString()
  note(`итог: ${status}${detail ? `: ${detail}` : ''}`)
  rmSync(workspace, { recursive: true, force: true })
  writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`)
  return record
}
