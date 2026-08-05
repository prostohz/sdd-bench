import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadCatalog } from '../src/catalog.js'
import { parseParticipant } from '../src/model/participant.js'
import { parseTask } from '../src/model/task.js'
import { ValidationError } from '../src/model/validate.js'

test('каталог репозитория проходит проверку', () => {
  const catalog = loadCatalog(process.cwd())
  assert.ok(catalog.tasks.length > 0, 'ожидается хотя бы одна задача')
  assert.deepEqual(
    catalog.participants.map((p) => p.id).sort(),
    ['canon', 'neutral', 'openspec', 'speckit'],
  )
})

test('greenfield-задача не может нести seed или базовые тесты', () => {
  assert.throws(
    () =>
      parseTask('task.json', '/tmp', {
        id: 'x',
        class: 'greenfield',
        intent: 'intent.md',
        seed: 'seed',
      }),
    (error: unknown) =>
      error instanceof ValidationError &&
      error.problems.some((p) => p.startsWith('seed:')),
  )
})

test('brownfield-задача без seed отвергается', () => {
  assert.throws(
    () => parseTask('task.json', '/tmp', { id: 'x', class: 'brownfield-spec', intent: 'intent.md' }),
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
        prompt: 'p.md',
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
      JSON.stringify({ id: 'other-id', class: 'greenfield', intent: 'intent.md' }),
    )

    assert.throws(
      () => loadCatalog(root),
      (error: unknown) =>
        error instanceof ValidationError &&
        error.problems.some((p) => p.includes('does not match its directory')) &&
        error.problems.some((p) => p.includes('intent "intent.md" is not a file')),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
