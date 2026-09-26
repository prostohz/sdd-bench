import { isAbsolute } from 'node:path'

import { ID } from './participant.js'
import { Reader } from './validate.js'

export const TASK_CLASSES = ['greenfield', 'brownfield-nospec', 'brownfield-spec'] as const
export type TaskClass = (typeof TASK_CLASSES)[number]

export interface TestCommand {
  /** Command run against the finished repository. */
  command: string
  /**
   * Two capture groups — passed and total — read from the runner's output.
   * Without it a run either passes wholly or not at all, by exit code.
   */
  countsPattern: string | undefined
}

export interface HiddenTests extends TestCommand {
  /** Directory inside the task, never placed in the participant's sandbox. */
  dir: string
}

export interface Task {
  id: string
  taskClass: TaskClass
  /** Absolute path of the task directory. */
  dir: string
  /** Intent handed to the participant verbatim, relative to `dir`. */
  intentFile: string
  /**
   * The intent's requirements, one per line, relative to `dir`. Judges of
   * `spec-fit` rule against this list and never against a list of their own,
   * and the participant never sees it.
   */
  requirementsFile: string
  /** Initial repository state, relative to `dir`. Absent for greenfield. */
  seedDir: string | undefined
  initialSpecs: Record<string, string>
  /** The project's own tests, whose continued passing is the regression check. */
  baselineTests: TestCommand | undefined
  /** Tests never placed in the participant's sandbox. */
  hiddenTests: HiddenTests | undefined
  /** Extra hosts the task's stack needs during setup. */
  allowHosts: string[]
}

export function parseTask(source: string, dir: string, value: unknown): Task {
  const reader = Reader.of(source, value)

  const id = reader.string('id')
  const taskClass = reader.enum('class', TASK_CLASSES)
  const intentFile = reader.string('intent')
  const requirementsFile = reader.string('requirements')
  const seedDir = reader.optionalString('seed')
  const initialSpecs = reader.stringMap('initialSpecs')
  const allowHosts = reader.stringArray('allowHosts')

  const baseline = reader.object('baselineTests')
  const baselineTests = baseline
    ? { command: baseline.string('command'), countsPattern: baseline.optionalString('countsPattern') }
    : undefined

  const hidden = reader.object('hiddenTests')
  const hiddenTests = hidden
    ? {
        dir: hidden.string('dir'),
        command: hidden.string('command'),
        countsPattern: hidden.optionalString('countsPattern'),
      }
    : undefined

  if (!ID.test(id)) reader.problem(`id: "${id}" must match ${ID} to name a sandbox`)
  if (taskClass === 'greenfield' && seedDir !== undefined) {
    reader.problem('seed: a greenfield task starts from no project')
  }
  if (taskClass !== 'greenfield' && seedDir === undefined) {
    reader.problem('seed: a brownfield task needs an initial repository state')
  }
  if (taskClass === 'greenfield' && baselineTests !== undefined) {
    reader.problem('baselineTests: regressions do not apply to a greenfield task')
  }
  if (taskClass === 'brownfield-spec' && Object.keys(initialSpecs).length === 0) {
    reader.problem('initialSpecs: a brownfield-spec task needs existing specifications')
  }
  if (taskClass !== 'brownfield-spec' && Object.keys(initialSpecs).length > 0) {
    reader.problem('initialSpecs: only brownfield-spec tasks may have existing specifications')
  }
  for (const [participant, path] of Object.entries(initialSpecs)) {
    if (!ID.test(participant) || isAbsolute(path) || path.includes('\\') || path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
      reader.problem(`initialSpecs.${participant}: expected a relative directory inside the task`)
    }
  }

  reader.done()

  return { id, taskClass, dir, intentFile, requirementsFile, seedDir, initialSpecs, baselineTests, hiddenTests, allowHosts }
}
