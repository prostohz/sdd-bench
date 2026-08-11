import { writeFileSync } from 'node:fs'

import { isRecord } from './model/validate.js'

/**
 * Saves what a CLI printed as readable JSON. The envelope arrives on a single
 * line, and its `result` field often carries JSON of its own as a string —
 * both are unreadable as written, and these files exist to be read. Output
 * that is not JSON at all is saved untouched, because then it is a diagnostic.
 */
export function writeCapturedJson(path: string, stdout: string): void {
  const envelope = resultEnvelope(stdout)
  if (envelope === undefined) {
    writeFileSync(path, stdout)
    return
  }
  writeFileSync(path, `${JSON.stringify(expandResult(envelope), null, 2)}\n`)
}

/** The agent's own words, without JSON escaping in the way. */
export function resultText(stdout: string): string | undefined {
  const envelope = resultEnvelope(stdout)
  if (!isRecord(envelope) || typeof envelope['result'] !== 'string') return undefined
  const text = envelope['result'].trim()
  return text === '' ? undefined : `${text}\n`
}

function expandResult(envelope: unknown): unknown {
  if (!isRecord(envelope) || typeof envelope['result'] !== 'string') return envelope
  const inner = parseJson(envelope['result'])
  return inner === undefined ? envelope : { ...envelope, result: inner }
}

/**
 * The envelope that closes a session, wherever it ended up. A streamed session
 * prints one event per line and the envelope is the last of them; a plain one
 * prints it alone. Either way the CLI may print notices of its own around it,
 * so a line that does not parse is passed over rather than believed.
 */
export function resultEnvelope(stdout: string): unknown {
  const lines = stdout.trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = parseJson(lines[i] ?? '')
    if (isRecord(candidate) && 'result' in candidate) return candidate
  }
  // Not one object per line: an envelope printed across several of them.
  return parseJson(stdout)
}

/** The CLI may print notices before the JSON, so the first object also counts. */
function parseJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === '') return undefined

  for (let start = trimmed.indexOf('{'); start !== -1; start = trimmed.indexOf('{', start + 1)) {
    try {
      return JSON.parse(trimmed.slice(start)) as unknown
    } catch {
      // Not a complete object at this offset; try the next one.
    }
  }
  return undefined
}
