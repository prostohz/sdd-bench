import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadCatalog } from '../src/catalog.js'
import { assertMountsAvailable, parseParticipant } from '../src/model/participant.js'
import { parseTask } from '../src/model/task.js'
import { ValidationError } from '../src/model/validate.js'
import type { RunRecord } from '../src/model/run.js'
import { selectRuns } from '../src/run/showRun.js'

test('каталог репозитория проходит проверку', () => {
  const catalog = loadCatalog(process.cwd())

  assert.ok(catalog.tasks.length > 0, 'ожидается хотя бы одна задача')
  assert.ok(catalog.participants.length > 0, 'ожидается хотя бы один участник')
  // Список участников не перечисляется: он меняется, а требование к нему — нет.
  for (const participant of catalog.participants) {
    assert.ok(participant.promptFiles.full, `${participant.id}: нет промта полного цикла`)
    assert.ok(participant.specPaths.length > 0, `${participant.id}: не сказано, где спецификация`)
  }
})

test('greenfield-задача не может нести seed или базовые тесты', () => {
  assert.throws(
    () =>
      parseTask('task.json', '/tmp', {
        id: 'x',
        class: 'greenfield',
        intent: 'intent.md',
        requirements: 'requirements.md',
        seed: 'seed',
      }),
    (error: unknown) =>
      error instanceof ValidationError &&
      error.problems.some((p) => p.startsWith('seed:')),
  )
})

test('brownfield-задача без seed отвергается', () => {
  assert.throws(
    () =>
      parseTask('task.json', '/tmp', {
        id: 'x',
        class: 'brownfield-spec',
        intent: 'intent.md',
        requirements: 'requirements.md',
      }),
    ValidationError,
  )
})

test('участник обязан назвать, где лежит спецификация', () => {
  assert.throws(
    () => parseParticipant('participant.json', '/tmp', { id: 'x', name: 'X', prompt: 'p.md' }),
    (error: unknown) =>
      error instanceof ValidationError && error.problems.some((p) => p.startsWith('specPaths:')),
  )
})

test('специфкация участника не может уходить за пределы репозитория', () => {
  assert.throws(
    () =>
      parseParticipant('participant.json', '/tmp', {
        id: 'x',
        name: 'X',
        prompts: { full: 'p.md' },
        specPaths: ['../secrets', 'spec/*'],
      }),
    (error: unknown) => error instanceof ValidationError && error.problems.length === 2,
  )
})

test('каталог сообщает обо всех проблемах разом', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-bench-catalog-'))
  try {
    mkdirSync(join(root, 'tasks', 'greenfield', 'wrong-place'), { recursive: true })
    writeFileSync(
      join(root, 'tasks', 'greenfield', 'wrong-place', 'task.json'),
      JSON.stringify({
        id: 'other-id',
        class: 'greenfield',
        intent: 'intent.md',
        requirements: 'requirements.md',
      }),
    )

    assert.throws(
      () => loadCatalog(root),
      (error: unknown) =>
        error instanceof ValidationError &&
        error.problems.some((p) => p.includes('does not match its directory')) &&
        error.problems.some((p) => p.includes('intent "intent.md" is not a file')) &&
        error.problems.some((p) => p.includes('requirements "requirements.md" is not a file')),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('участник обязан объявить промт полного цикла', () => {
  assert.throws(
    () =>
      parseParticipant('participant.json', '/tmp', {
        id: 'x',
        name: 'X',
        specPaths: ['spec'],
        prompts: { spec: 'p-spec.md' },
      }),
    (error: unknown) =>
      error instanceof ValidationError && error.problems.some((p) => p.startsWith('prompts.full:')),
  )
})

test('отсутствующий локальный mount не мешает читать каталог, но блокирует запуск участника', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-bench-mount-'))
  try {
    const participant = parseParticipant('participant.json', '/tmp', {
      id: 'local-tool',
      name: 'Local Tool',
      prompts: { full: 'prompt.md' },
      specPaths: ['spec'],
      mounts: { tool: join(root, 'missing') },
    })

    assert.throws(() => assertMountsAvailable(participant), /mounts\.tool не найден/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('выбор запуска сужается по задаче, участнику, этапу и повтору', () => {
  const record = (over: Record<string, unknown>): RunRecord =>
    ({ taskId: 't', participantId: 'p', stage: 'full', repeat: 1, ...over }) as unknown as RunRecord

  const records = [
    record({}),
    record({ repeat: 2 }),
    record({ participantId: 'q' }),
    record({ stage: 'spec' }),
    // Записи, сделанные до появления этапов, считаются полным циклом.
    record({ stage: undefined, repeat: 3 }),
  ]

  assert.equal(selectRuns(records, {}).length, 5)
  assert.equal(selectRuns(records, { participants: ['q'] }).length, 1)
  assert.equal(selectRuns(records, { stage: 'spec' }).length, 1)
  assert.equal(selectRuns(records, { stage: 'full' }).length, 4)
  assert.equal(selectRuns(records, { participants: ['p'], stage: 'full', repeat: 1 }).length, 1)
  assert.equal(selectRuns(records, { tasks: ['другая'] }).length, 0)
})
