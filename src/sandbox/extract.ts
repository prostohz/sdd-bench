import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { Participant } from '../model/participant.js'
import { runOrThrow } from '../proc.js'
import { shellQuote } from '../shell.js'
import type { Sandbox } from './driver.js'

/** Where the specification is staged before it leaves the sandbox. */
export const SPEC_STAGING = '/tmp/sdd-bench-out/spec'

export interface Extraction {
  /** The finished repository, as a git bundle of every branch. */
  bundlePath: string
  /** The specification, moved out of the participant's own directory names. */
  specDir: string
  specFiles: number
}

/**
 * Takes the result out of the sandbox. Uncommitted work is committed first, so
 * nothing the participant left behind is lost, and the specification is copied
 * into a neutral `spec/` so its location does not name the participant to the
 * judge.
 */
export async function extractResult(
  sandbox: Sandbox,
  participant: Participant,
  runDir: string,
): Promise<Extraction> {
  const repo = await sandbox.repoPath()
  const bundlePath = join(runDir, 'repo.bundle')
  const specDir = join(runDir, 'spec')

  await sandbox.exec(
    [
      `cd ${shellQuote(repo)}`,
      'git add --all',
      'git -c user.name=sdd-bench -c user.email=bench@localhost commit --quiet ' +
        '--allow-empty --message "sdd-bench: final state" || true',
      'mkdir -p /tmp/sdd-bench-out',
      'git bundle create /tmp/sdd-bench-out/repo.bundle --all',
    ].join(' && '),
  )
  await sandbox.copyOut('/tmp/sdd-bench-out/repo.bundle', bundlePath)

  await sandbox.exec(collectSpecScript(repo, participant.specPaths))
  await sandbox.copyOut(SPEC_STAGING, specDir)

  return { bundlePath, specDir, specFiles: countFiles(specDir) }
}

/** Restores an extracted bundle into a working tree the judge can read. */
export async function restoreRepo(bundlePath: string, dir: string): Promise<string> {
  rmSync(dir, { recursive: true, force: true })
  await runOrThrow('git', ['clone', '--quiet', bundlePath, dir])
  return dir
}

function collectSpecScript(repo: string, specPaths: string[]): string {
  const lines = [`rm -rf ${SPEC_STAGING}`, `mkdir -p ${SPEC_STAGING}`, `cd ${shellQuote(repo)}`]
  const single = specPaths.length === 1

  specPaths.forEach((path, index) => {
    const target = single ? SPEC_STAGING : `${SPEC_STAGING}/part-${index + 1}`
    lines.push(`mkdir -p ${target}`)
    // A directory contributes its contents, a file itself; either way the
    // participant's own directory name is left behind.
    lines.push(
      `if [ -d ${shellQuote(path)} ]; then cp -R ${shellQuote(path)}/. ${target}/ 2>/dev/null || true; ` +
        `elif [ -e ${shellQuote(path)} ]; then cp ${shellQuote(path)} ${target}/ 2>/dev/null || true; fi`,
    )
  })

  return lines.join(' && ')
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    count += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1
  }
  return count
}
