import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { Reader } from './validate.js'

/** Task and participant identifiers end up in a sandbox name. */
export const ID = /^[a-z0-9][a-z0-9-]*$/

export interface Participant {
  id: string
  name: string
  /** Absolute path of the participant directory. */
  dir: string
  /** Script installing the participant's tooling in the sandbox, relative to `dir`. */
  setupFile: string | undefined
  /** Prompt template with `{{intent}}`, relative to `dir`. */
  promptFile: string
  /**
   * Directories or files where this participant keeps its specification,
   * relative to the repository root. Their contents are lifted into a neutral
   * `spec/` before judging, so the location does not name the participant.
   */
  specPaths: string[]
  /** Hosts the setup script needs. */
  allowHosts: string[]
  /**
   * Host directories mounted read-only, by name. The setup script reads each
   * as `SDD_MOUNT_<NAME>`; it needs them when a participant's tooling is not
   * published anywhere the sandbox can reach.
   */
  mounts: Record<string, string>
  /** Command whose output records the tooling version alongside the result. */
  versionProbe: string | undefined
}

export function parseParticipant(source: string, dir: string, value: unknown): Participant {
  const reader = Reader.of(source, value)

  const id = reader.string('id')
  const name = reader.string('name')
  const setupFile = reader.optionalString('setup')
  const promptFile = reader.string('prompt')
  const specPaths = reader.stringArray('specPaths')
  const allowHosts = reader.stringArray('allowHosts')
  const versionProbe = reader.optionalString('versionProbe')
  const mounts = Object.fromEntries(
    Object.entries(reader.stringMap('mounts')).map(([name, path]) => [name, expandHome(path)]),
  )

  if (!ID.test(id)) reader.problem(`id: "${id}" must match ${ID} to name a sandbox`)
  for (const [name, path] of Object.entries(mounts)) {
    if (!existsSync(path)) reader.problem(`mounts.${name}: "${path}" does not exist`)
  }
  if (specPaths.length === 0) {
    reader.problem('specPaths: a participant must say where its specification lives')
  }
  for (const path of specPaths) {
    if (path.startsWith('/') || path.split('/').includes('..')) {
      reader.problem(`specPaths: "${path}" must stay inside the repository`)
    }
    if (/[*?[\]]/.test(path)) {
      reader.problem(`specPaths: "${path}" must be a plain path, not a glob`)
    }
  }

  reader.done()

  return { id, name, dir, setupFile, promptFile, specPaths, allowHosts, mounts, versionProbe }
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}
