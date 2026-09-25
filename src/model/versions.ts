import type { RunRecord } from './run.js'

export function toolVersion(run: RunRecord): string | undefined {
  return run.versions[run.participantId]?.trim().replace(/^version:\s*/i, '') || undefined
}

export function participantVersions(runs: RunRecord[], participantId: string): string[] {
  const versions = runs.filter((run) => run.participantId === participantId).map(toolVersion)
  return [...new Set(versions.filter((version) => version !== undefined))].sort()
}
