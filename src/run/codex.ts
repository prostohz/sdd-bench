import type { Effort } from '../config.js'
import type { Telemetry } from '../model/run.js'
import type { ProcResult } from '../proc.js'
import type { Sandbox } from '../sandbox/driver.js'
import { isRecord } from '../model/validate.js'
import { shellQuote } from '../shell.js'

export const PROMPT_PATH = '/tmp/sdd-bench/prompt.md'
const SCHEMA_PATH = '/tmp/sdd-bench/output-schema.json'

export interface CodexInvocation {
  model: string
  effort: Effort
  promptPath: string
  jsonSchema?: string
  cwd?: string
  timeoutMs: number
  onStdout?: (chunk: string) => void
}

export interface CodexResult {
  isError: boolean
  subtype: string
  text: string
  telemetry: Telemetry
}

export interface CodexRun {
  proc: ProcResult
  result: CodexResult | undefined
  parseError: string | undefined
}

export async function runCodex(sandbox: Sandbox, invocation: CodexInvocation): Promise<CodexRun> {
  if (invocation.jsonSchema !== undefined) {
    const schema = JSON.parse(invocation.jsonSchema) as unknown
    const written = await sandbox.exec(
      `mkdir -p /tmp/sdd-bench && printf %s ${shellQuote(JSON.stringify(schema))} > ${SCHEMA_PATH}`,
    )
    if (written.code !== 0) throw new Error(`не удалось записать схему судьи: ${written.stderr}`)
  }

  const args = [
    'codex exec',
    '--json',
    '--ephemeral',
    '--ignore-rules',
    '--skip-git-repo-check',
    '--sandbox danger-full-access',
    `--model ${shellQuote(invocation.model)}`,
    `--config ${shellQuote(`model_reasoning_effort=\"${invocation.effort}\"`)}`,
    ...(invocation.jsonSchema === undefined ? [] : [`--output-schema ${SCHEMA_PATH}`]),
    '-',
  ]
  const command = `cat ${shellQuote(invocation.promptPath)} | ${args.join(' ')}`
  const proc = await sandbox.exec(command, {
    timeoutMs: invocation.timeoutMs,
    ...(invocation.cwd === undefined ? {} : { cwd: invocation.cwd }),
    ...(invocation.onStdout === undefined ? {} : { onStdout: invocation.onStdout }),
  })

  try {
    return { proc, result: parseCodexResult(proc.stdout, proc.activeMs), parseError: undefined }
  } catch (error) {
    return { proc, result: undefined, parseError: (error as Error).message }
  }
}

export function parseCodexResult(stdout: string, activeMs: number): CodexResult {
  let text = ''
  let usage: Record<string, unknown> = {}
  let subtype = 'unknown'
  let turns = 0
  let error = ''

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(parsed)) continue
    if (parsed['type'] === 'turn.started') turns += 1
    if (parsed['type'] === 'turn.completed') {
      subtype = 'success'
      usage = isRecord(parsed['usage']) ? parsed['usage'] : {}
    }
    if (parsed['type'] === 'turn.failed') {
      subtype = 'failed'
      error = describeError(parsed['error'])
    }
    if (parsed['type'] === 'error') error = describeError(parsed)
    if (parsed['type'] === 'item.completed' && isRecord(parsed['item'])) {
      const item = parsed['item']
      if (item['type'] === 'agent_message' && typeof item['text'] === 'string') text = item['text']
    }
  }

  if (subtype === 'unknown') throw new Error('вывод codex не содержит завершения хода')
  const inputTokens = numberOr(usage['input_tokens'])
  const outputTokens = numberOr(usage['output_tokens'])
  const cacheReadTokens = numberOr(usage['cached_input_tokens'])
  const cacheCreationTokens = numberOr(usage['cache_write_tokens'])
  return {
    isError: subtype === 'failed',
    subtype,
    text: text || error,
    telemetry: {
      activeMs,
      durationMs: activeMs,
      apiDurationMs: undefined,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: undefined,
      numTurns: turns,
    },
  }
}

function numberOr(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function describeError(value: unknown): string {
  if (isRecord(value) && typeof value['message'] === 'string') return value['message']
  return typeof value === 'string' ? value : ''
}
