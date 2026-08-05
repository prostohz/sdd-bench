import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { resultText, writeCapturedJson } from '../artifacts.js'
import type { BenchConfig } from '../config.js'
import type { Participant } from '../model/participant.js'
import type { Task } from '../model/task.js'
import { runDirName, type RunRecord, type RunStatus } from '../model/run.js'
import type { Sandbox, SandboxDriver } from '../sandbox/driver.js'
import { extractResult } from '../sandbox/extract.js'
import { materializeWorkspace } from '../sandbox/workspace.js'
import { shellQuote } from '../shell.js'
import { PROMPT_PATH, runClaude, type ClaudeRun } from './claude.js'
import { runTests } from './projectTests.js'

const SETUP_PATH = '/tmp/sdd-bench/setup.sh'

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
  const runId = `${task.id}-${participant.id}-${repeat}`
  const runDir = join(ctx.resultDir, 'runs', runDirName({ taskId: task.id, participantId: participant.id, repeat }))
  const workspace = join(runDir, 'workspace')
  mkdirSync(runDir, { recursive: true })

  const record: RunRecord = {
    runId,
    taskId: task.id,
    taskClass: task.taskClass,
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

  ctx.log(`▶ ${runId}`)
  await materializeWorkspace(task, workspace)

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

    const setupFailure = await setUp(sandbox, participant, repo, runDir, record)
    if (setupFailure) return finish(record, 'error', setupFailure, runDir, workspace)

    const promptFile = join(runDir, 'prompt.md')
    writeFileSync(promptFile, buildPrompt(task, participant))
    await sandbox.copyIn(promptFile, PROMPT_PATH)

    const run = await runClaude(sandbox, {
      model: ctx.config.model,
      effort: ctx.config.effort,
      promptPath: PROMPT_PATH,
      maxBudgetUsd: ctx.config.maxBudgetUsd,
      cwd: repo,
      timeoutMs: ctx.config.timeoutMs,
    })

    writeCapturedJson(join(runDir, 'agent.json'), run.proc.stdout)
    const said = resultText(run.proc.stdout)
    if (said) writeFileSync(join(runDir, 'agent.md'), said)
    if (run.proc.stderr.trim()) writeFileSync(join(runDir, 'agent.err'), run.proc.stderr)
    record.telemetry = run.result?.telemetry

    const extraction = await extractResult(sandbox, participant, runDir)
    bundlePath = extraction.bundlePath
    if (extraction.specFiles === 0) ctx.log(`  спецификация не найдена в ${participant.specPaths.join(', ')}`)

    if (run.proc.timedOut) return finish(record, 'timeout', 'лимит времени исчерпан', runDir, workspace)
    if (run.proc.code !== 0 || run.result?.isError) {
      return finish(record, 'error', agentFailure(run), runDir, workspace)
    }
  } finally {
    await sandbox.remove()
  }

  if (bundlePath) await check(ctx, task, record, bundlePath, runDir)
  return finish(record, record.status, record.statusDetail, runDir, workspace)
}

async function setUp(
  sandbox: Sandbox,
  participant: Participant,
  repo: string,
  runDir: string,
  record: RunRecord,
): Promise<string | undefined> {
  if (participant.setupFile) {
    await sandbox.copyIn(join(participant.dir, participant.setupFile), SETUP_PATH)
    const setup = await sandbox.exec(`${setupEnv(participant, repo)} bash ${SETUP_PATH}`, {
      timeoutMs: 20 * 60 * 1000,
    })
    writeFileSync(join(runDir, 'setup.log'), `${setup.stdout}\n${setup.stderr}`)
    if (setup.code !== 0) return `установка инструментария участника завершилась с кодом ${setup.code}`
  }

  if (participant.versionProbe) {
    const probe = await sandbox.exec(participant.versionProbe, { timeoutMs: 2 * 60 * 1000 })
    if (probe.code === 0) record.versions[participant.id] = probe.stdout.trim().split('\n')[0] ?? ''
  }

  const cli = await sandbox.exec('claude --version', { timeoutMs: 2 * 60 * 1000 })
  if (cli.code === 0) record.versions['claude'] = cli.stdout.trim()

  return undefined
}

/** Regressions, then the hidden tests, both outside the participant's sandbox. */
async function check(
  ctx: RunContext,
  task: Task,
  record: RunRecord,
  bundlePath: string,
  runDir: string,
): Promise<void> {
  const common = {
    driver: ctx.driver,
    bundlePath,
    task,
    allowHosts: [...ctx.config.allowHosts, ...task.allowHosts],
    timeoutMs: ctx.config.judgeTimeoutMs,
  }

  if (task.baselineTests) {
    record.baseline = await runTests({
      ...common,
      sandboxName: `${record.runId}-baseline`,
      suite: task.baselineTests,
    })
    writeFileSync(join(runDir, 'baseline.log'), record.baseline.output)
  }

  if (task.hiddenTests) {
    record.hidden = await runTests({
      ...common,
      sandboxName: `${record.runId}-hidden`,
      suite: task.hiddenTests,
      overlayDir: join(task.dir, task.hiddenTests.dir),
    })
    writeFileSync(join(runDir, 'hidden.log'), record.hidden.output)
  }
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

function buildPrompt(task: Task, participant: Participant): string {
  const intent = readFileSync(join(task.dir, task.intentFile), 'utf8').trim()
  const template = readFileSync(join(participant.dir, participant.promptFile), 'utf8')
  return template.replaceAll('{{intent}}', intent)
}

function finish(
  record: RunRecord,
  status: RunStatus,
  detail: string | undefined,
  runDir: string,
  workspace: string,
): RunRecord {
  record.status = status
  record.statusDetail = detail
  record.finishedAt = new Date().toISOString()
  rmSync(workspace, { recursive: true, force: true })
  writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`)
  return record
}
