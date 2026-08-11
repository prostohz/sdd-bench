import { resultEnvelope } from '../artifacts.js'
import type { Effort } from '../config.js'
import type { Telemetry } from '../model/run.js'
import type { ProcResult } from '../proc.js'
import type { Sandbox } from '../sandbox/driver.js'
import { isRecord } from '../model/validate.js'
import { shellQuote } from '../shell.js'

export const PROMPT_PATH = '/tmp/sdd-bench/prompt.md'

export interface ClaudeInvocation {
  model: string
  effort: Effort
  /** Prompt file already placed inside the sandbox. */
  promptPath: string
  jsonSchema?: string
  maxBudgetUsd?: number | undefined
  addDirs?: string[]
  cwd?: string
  timeoutMs: number
  /**
   * Given a reader, the session is asked for as a stream: every turn arrives
   * as it happens instead of all at once at the end. A judge has nothing to
   * watch, so it asks for the plain envelope.
   */
  onStdout?: (chunk: string) => void
}

export interface ClaudeResult {
  isError: boolean
  subtype: string
  text: string
  telemetry: Telemetry
}

export interface ClaudeRun {
  proc: ProcResult
  result: ClaudeResult | undefined
  parseError: string | undefined
}

/**
 * One headless agent session. Settings come from the project only, so nothing
 * of the host user's configuration reaches the run.
 */
export async function runClaude(sandbox: Sandbox, invocation: ClaudeInvocation): Promise<ClaudeRun> {
  const args = [
    'claude',
    '-p',
    // A stream is one event per line, the envelope last; `--verbose` is what
    // makes the CLI emit the turns themselves rather than only the envelope.
    ...(invocation.onStdout ? ['--output-format stream-json', '--verbose'] : ['--output-format json']),
    `--model ${shellQuote(invocation.model)}`,
    `--effort ${shellQuote(invocation.effort)}`,
    '--permission-mode bypassPermissions',
    // The sandbox's own user settings carry the apiKeyHelper that sbx writes;
    // dropping them leaves the agent unauthenticated. Nothing of the host
    // user's configuration is there — the sandbox never sees it.
    '--setting-sources user,project,local',
    '--no-session-persistence',
  ]
  if (invocation.maxBudgetUsd !== undefined) args.push(`--max-budget-usd ${invocation.maxBudgetUsd}`)
  if (invocation.jsonSchema) args.push(`--json-schema ${shellQuote(invocation.jsonSchema)}`)
  for (const dir of invocation.addDirs ?? []) args.push(`--add-dir ${shellQuote(dir)}`)
  args.push(`"$(cat ${shellQuote(invocation.promptPath)})"`)

  const proc = await sandbox.exec(args.join(' '), {
    timeoutMs: invocation.timeoutMs,
    ...(invocation.cwd === undefined ? {} : { cwd: invocation.cwd }),
    ...(invocation.onStdout === undefined ? {} : { onStdout: invocation.onStdout }),
  })

  try {
    return { proc, result: parseClaudeResult(proc.stdout, proc.activeMs), parseError: undefined }
  } catch (error) {
    return { proc, result: undefined, parseError: (error as Error).message }
  }
}

export function parseClaudeResult(stdout: string, activeMs: number): ClaudeResult {
  const envelope = resultEnvelope(stdout)
  if (!isRecord(envelope)) throw new Error('вывод claude не содержит JSON-результата')

  const usage = isRecord(envelope['usage']) ? envelope['usage'] : {}
  const inputTokens = numberOr(usage['input_tokens'], 0)
  const outputTokens = numberOr(usage['output_tokens'], 0)
  const cacheCreationTokens = numberOr(usage['cache_creation_input_tokens'], 0)
  const cacheReadTokens = numberOr(usage['cache_read_input_tokens'], 0)

  return {
    isError: envelope['is_error'] === true,
    subtype: typeof envelope['subtype'] === 'string' ? envelope['subtype'] : 'unknown',
    text: typeof envelope['result'] === 'string' ? envelope['result'] : '',
    telemetry: {
      activeMs,
      durationMs: numberOr(envelope['duration_ms'], activeMs),
      apiDurationMs: optionalNumber(envelope['duration_api_ms']),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
      costUsd: optionalNumber(envelope['total_cost_usd']),
      numTurns: optionalNumber(envelope['num_turns']),
    },
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
