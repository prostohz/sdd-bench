import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, basename, dirname } from 'node:path'

import { parseTask, type Task } from './model/task.js'
import { parseParticipant, type Participant } from './model/participant.js'
import { ValidationError } from './model/validate.js'

export interface Catalog {
  root: string
  tasks: Task[]
  participants: Participant[]
}

export function loadCatalog(root: string): Catalog {
  const problems: string[] = []
  const tasks = loadTasks(join(root, 'tasks'), problems)
  const participants = loadParticipants(join(root, 'participants'), problems)

  if (problems.length > 0) throw new ValidationError('catalog', problems)
  return { root, tasks, participants }
}

export function findTask(catalog: Catalog, id: string): Task {
  const task = catalog.tasks.find((t) => t.id === id)
  if (!task) throw new Error(`unknown task "${id}"; known: ${catalog.tasks.map((t) => t.id).join(', ')}`)
  return task
}

export function findParticipant(catalog: Catalog, id: string): Participant {
  const participant = catalog.participants.find((p) => p.id === id)
  if (!participant) {
    throw new Error(
      `unknown participant "${id}"; known: ${catalog.participants.map((p) => p.id).join(', ')}`,
    )
  }
  return participant
}

function loadTasks(tasksRoot: string, problems: string[]): Task[] {
  const tasks: Task[] = []
  for (const descriptor of findDescriptors(tasksRoot, 'task.json')) {
    const dir = dirname(descriptor)
    const source = relative(dirname(tasksRoot), descriptor)
    let task: Task
    try {
      task = parseTask(source, dir, readJson(descriptor))
    } catch (error) {
      problems.push(describe(error))
      continue
    }

    if (basename(dir) !== task.id) {
      problems.push(`${source}: id "${task.id}" does not match its directory "${basename(dir)}"`)
    }
    if (basename(dirname(dir)) !== task.taskClass) {
      problems.push(`${source}: class "${task.taskClass}" does not match its directory "${basename(dirname(dir))}"`)
    }
    requireFile(dir, task.intentFile, source, 'intent', problems)
    if (task.seedDir) requireDir(dir, task.seedDir, source, 'seed', problems)
    if (task.hiddenTests) requireDir(dir, task.hiddenTests.dir, source, 'hiddenTests.dir', problems)

    tasks.push(task)
  }

  reportDuplicates(tasks.map((t) => t.id), 'task', problems)
  return tasks
}

function loadParticipants(participantsRoot: string, problems: string[]): Participant[] {
  const participants: Participant[] = []
  for (const descriptor of findDescriptors(participantsRoot, 'participant.json')) {
    const dir = dirname(descriptor)
    const source = relative(dirname(participantsRoot), descriptor)
    let participant: Participant
    try {
      participant = parseParticipant(source, dir, readJson(descriptor))
    } catch (error) {
      problems.push(describe(error))
      continue
    }

    if (basename(dir) !== participant.id) {
      problems.push(`${source}: id "${participant.id}" does not match its directory "${basename(dir)}"`)
    }
    if (participant.setupFile) requireFile(dir, participant.setupFile, source, 'setup', problems)

    for (const [stage, file] of Object.entries(participant.promptFiles)) {
      requireFile(dir, file, source, `prompts.${stage}`, problems)
      if (!existsSync(join(dir, file))) continue
      if (!readFileSync(join(dir, file), 'utf8').includes('{{intent}}')) {
        problems.push(`${source}: prompts.${stage} must carry the intent through {{intent}}`)
      }
    }

    participants.push(participant)
  }

  reportDuplicates(participants.map((p) => p.id), 'participant', problems)
  return participants
}

function findDescriptors(root: string, name: string): string[] {
  if (!existsSync(root)) return []
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name === name) found.push(path)
    }
  }
  walk(root)
  return found.sort()
}

function readJson(path: string): unknown {
  const text = readFileSync(path, 'utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new ValidationError(path, [`not valid JSON: ${(error as Error).message}`])
  }
}

function requireFile(dir: string, relPath: string, source: string, key: string, problems: string[]): void {
  const path = join(dir, relPath)
  if (!existsSync(path) || !statSync(path).isFile()) {
    problems.push(`${source}: ${key} "${relPath}" is not a file`)
  }
}

function requireDir(dir: string, relPath: string, source: string, key: string, problems: string[]): void {
  const path = join(dir, relPath)
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    problems.push(`${source}: ${key} "${relPath}" is not a directory`)
  }
}

function reportDuplicates(ids: string[], kind: string, problems: string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) problems.push(`${kind} "${id}" is declared more than once`)
    seen.add(id)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
