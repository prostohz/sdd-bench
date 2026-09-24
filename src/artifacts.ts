import { writeFileSync } from 'node:fs'

import { isRecord } from './model/validate.js'

export function writeCapturedJson(path: string, stdout: string): void {
  const envelope = resultEnvelope(stdout)
  if (envelope !== undefined) {
    const result = isRecord(envelope) && typeof envelope['result'] === 'string'
      ? parseJson(envelope['result']) ?? envelope['result']
      : undefined
    writeFileSync(path, `${JSON.stringify({ ...envelope, result }, null, 2)}\n`)
    return
  }
  const events = readEvents(stdout)
  if (events.length === 0) {
    writeFileSync(path, stdout)
    return
  }
  const text = resultText(stdout)
  let result: unknown = text?.trim()
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result)
    } catch {
      result = text?.trim()
    }
  }
  writeFileSync(path, `${JSON.stringify({ events, result }, null, 2)}\n`)
}

export function resultText(stdout: string): string | undefined {
  const envelope = resultEnvelope(stdout)
  if (isRecord(envelope) && typeof envelope['result'] === 'string') {
    const text = envelope['result'].trim()
    return text === '' ? undefined : `${text}\n`
  }
  let text = ''
  for (const event of readEvents(stdout)) {
    if (event['type'] !== 'item.completed' || !isRecord(event['item'])) continue
    const item = event['item']
    if (item['type'] === 'agent_message' && typeof item['text'] === 'string') text = item['text']
  }
  return text.trim() === '' ? undefined : `${text.trim()}\n`
}

export function resultEnvelope(stdout: string): Record<string, unknown> | undefined {
  for (const line of stdout.trim().split('\n').reverse()) {
    const parsed = parseJson(line)
    if (isRecord(parsed) && parsed['type'] === 'result' && 'result' in parsed) return parsed
  }
  const parsed = parseJson(stdout)
  return isRecord(parsed) && 'result' in parsed ? parsed : undefined
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function readEvents(stdout: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = []
  for (const line of stdout.split('\n')) {
    try {
      const event: unknown = JSON.parse(line)
      if (isRecord(event) && typeof event['type'] === 'string') events.push(event)
    } catch {
      continue
    }
  }
  return events
}
