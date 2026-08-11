import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

import { isRecord } from '../model/validate.js'

/**
 * The agent's session while it is still going. `agent.jsonl` keeps every event
 * verbatim; `agent.log` keeps what a person reads — what the agent said and
 * which tool it reached for. Both are written as the events arrive, so a run
 * that is still running, or one that died without ever printing an envelope,
 * can be read all the same.
 */
export function agentStream(runDir: string): (chunk: string) => void {
  const events = join(runDir, 'agent.jsonl')
  const readable = join(runDir, 'agent.log')
  let rest = ''

  return (chunk) => {
    const lines = (rest + chunk).split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim() === '') continue
      appendFileSync(events, `${line}\n`)
      const said = render(line)
      if (said) appendFileSync(readable, `${new Date().toISOString()} ${said}\n`)
    }
  }
}

/** One line per event, or nothing for the events that say nothing to a reader. */
function render(line: string): string | undefined {
  let event: unknown
  try {
    event = JSON.parse(line)
  } catch {
    // Not an event: the CLI prints notices of its own around the stream.
    return line.trim()
  }
  if (!isRecord(event)) return undefined

  switch (event['type']) {
    case 'system':
      return event['subtype'] === 'init' ? 'сессия начата' : undefined
    case 'assistant':
      return renderContent(event, '')
    case 'user':
      return renderContent(event, '')
    case 'result':
      return `завершение: ${String(event['subtype'] ?? '')}`
    default:
      return undefined
  }
}

function renderContent(event: Record<string, unknown>, prefix: string): string | undefined {
  const message = event['message']
  if (!isRecord(message) || !Array.isArray(message['content'])) return undefined

  const said: string[] = []
  for (const block of message['content']) {
    if (!isRecord(block)) continue
    switch (block['type']) {
      case 'text':
        if (typeof block['text'] === 'string' && block['text'].trim()) said.push(block['text'].trim())
        break
      case 'thinking':
        said.push('[размышление]')
        break
      case 'tool_use':
        said.push(`→ ${String(block['name'] ?? 'tool')} ${brief(block['input'])}`)
        break
      case 'tool_result':
        said.push(`← ${brief(block['content'])}`)
        break
    }
  }
  return said.length === 0 ? undefined : `${prefix}${said.join('\n')}`
}

/** A tool's arguments and its output are quoted, not reproduced. */
const BRIEF_LIMIT = 200

function brief(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return ''
  const flat = text.replaceAll('\n', ' ').trim()
  return flat.length > BRIEF_LIMIT ? `${flat.slice(0, BRIEF_LIMIT)}…` : flat
}
