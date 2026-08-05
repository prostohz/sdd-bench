import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { runOrThrow } from '../proc.js'
import type { Task } from '../model/task.js'

/** Fixed so every participant and every repeat start from the same commit. */
const SEED_COMMIT = {
  GIT_AUTHOR_NAME: 'sdd-bench',
  GIT_AUTHOR_EMAIL: 'bench@localhost',
  GIT_COMMITTER_NAME: 'sdd-bench',
  GIT_COMMITTER_EMAIL: 'bench@localhost',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
}

/**
 * Lays out the initial repository state of a task in `dir`. A greenfield task
 * gets an empty repository; clone mode needs one either way.
 */
export async function materializeWorkspace(task: Task, dir: string): Promise<string> {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  if (task.seedDir) cpSync(join(task.dir, task.seedDir), dir, { recursive: true })

  const env = { ...process.env, ...SEED_COMMIT }
  await runOrThrow('git', ['init', '--quiet', '--initial-branch', 'main'], { cwd: dir, env })
  await runOrThrow('git', ['add', '--all'], { cwd: dir, env })
  await runOrThrow('git', ['commit', '--quiet', '--allow-empty', '--message', `seed: ${task.id}`], {
    cwd: dir,
    env,
  })

  return dir
}

/** The commit the participant started from, used to see what it changed. */
export async function headCommit(dir: string): Promise<string> {
  const result = await runOrThrow('git', ['rev-parse', 'HEAD'], { cwd: dir })
  return result.stdout.trim()
}
