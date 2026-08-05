import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { TestCommand, Task } from '../model/task.js'
import type { TestOutcome } from '../model/run.js'
import { restoreRepo } from '../sandbox/extract.js'
import type { SandboxDriver } from '../sandbox/driver.js'

export interface TestRunOptions {
  driver: SandboxDriver
  sandboxName: string
  bundlePath: string
  task: Task
  suite: TestCommand
  /** Task directory to lay over the repository root, for hidden tests. */
  overlayDir?: string
  allowHosts: string[]
  timeoutMs: number
}

/**
 * Runs a test command against the finished repository, in a sandbox of its
 * own that the participant never saw.
 */
export async function runTests(options: TestRunOptions): Promise<TestOutcome> {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-bench-tests-'))
  try {
    await restoreRepo(options.bundlePath, join(dir, 'repo'))
    if (options.overlayDir) cpSync(options.overlayDir, join(dir, 'repo'), { recursive: true })

    const sandbox = await options.driver.create({
      name: options.sandboxName,
      workspace: join(dir, 'repo'),
      agent: 'shell',
      clone: false,
    })
    try {
      await sandbox.allowHosts(options.allowHosts)
      const proc = await sandbox.exec(options.suite.command, { timeoutMs: options.timeoutMs })
      const output = `${proc.stdout}\n${proc.stderr}`.trim()
      return {
        command: options.suite.command,
        exitCode: proc.timedOut ? -1 : proc.code,
        passRatio: passRatio(proc.timedOut ? -1 : proc.code, output, options.suite.countsPattern),
        output: tail(output, 8000),
      }
    } finally {
      await sandbox.remove()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function passRatio(exitCode: number, output: string, countsPattern: string | undefined): number {
  if (countsPattern) {
    const match = new RegExp(countsPattern).exec(output)
    const passed = Number(match?.[1])
    const total = Number(match?.[2])
    if (Number.isFinite(passed) && Number.isFinite(total) && total > 0) return passed / total
  }
  return exitCode === 0 ? 1 : 0
}

function tail(text: string, limit: number): string {
  return text.length <= limit ? text : `…\n${text.slice(-limit)}`
}
