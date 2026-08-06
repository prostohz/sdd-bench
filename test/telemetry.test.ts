import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resultText, writeCapturedJson } from '../src/artifacts.js'

import { parseVerdict } from '../src/judge/judge.js'
import { parseClaudeResult } from '../src/run/claude.js'
import { passRatio } from '../src/run/projectTests.js'
import { uniqueHosts } from '../src/sandbox/sbx.js'

const ENVELOPE = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 754_000,
  duration_api_ms: 700_000,
  num_turns: 42,
  result: 'готово',
  total_cost_usd: 3.21,
  usage: {
    input_tokens: 1200,
    output_tokens: 800,
    cache_creation_input_tokens: 40_000,
    cache_read_input_tokens: 900_000,
  },
})

test('телеметрия читается из результата claude', () => {
  const parsed = parseClaudeResult(ENVELOPE, 1)
  assert.equal(parsed.text, 'готово')
  assert.equal(parsed.isError, false)
  assert.equal(parsed.telemetry.durationMs, 754_000)
  assert.equal(parsed.telemetry.totalTokens, 1200 + 800 + 40_000 + 900_000)
  assert.equal(parsed.telemetry.costUsd, 3.21)
})

test('шум перед результатом не мешает его найти', () => {
  const parsed = parseClaudeResult(`предупреждение\n{"не":"тот"}\n${ENVELOPE}`, 1)
  assert.equal(parsed.text, 'готово')
})

test('вывод без результата — ошибка, а не молчаливый ноль', () => {
  assert.throws(() => parseClaudeResult('claude: command not found', 1), /не содержит JSON/)
})

test('длительность берётся по стене, когда её нет в ответе', () => {
  const parsed = parseClaudeResult(JSON.stringify({ result: 'ок' }), 5000)
  assert.equal(parsed.telemetry.durationMs, 5000)
  assert.equal(parsed.telemetry.costUsd, undefined)
})

test('доля прошедших тестов — из счётчиков, иначе по коду возврата', () => {
  const pattern = 'passed (\\d+) of (\\d+)'
  assert.equal(passRatio(1, 'passed 9 of 12', pattern), 0.75)
  assert.equal(passRatio(0, 'нет счётчиков', pattern), 1)
  assert.equal(passRatio(1, 'нет счётчиков', pattern), 0)
  assert.equal(passRatio(0, '', undefined), 1)
})

test('вердикт судьи читается и обрезается по шкале', () => {
  const verdict = parseVerdict('{"score": 12, "rationale": "потому что", "evidence": ["a.ts:1"]}', 'Q')
  assert.equal(verdict.score, 10)
  assert.equal(verdict.rationale, 'потому что')
  assert.deepEqual(verdict.evidence, ['a.ts:1'])
})

test('ответ судьи не в виде оценки — ошибка', () => {
  assert.throws(() => parseVerdict('не могу оценить', 'IS'), /судья IS/)
})

test('сохранённый вывод форматируется и разворачивает вложенный JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-bench-artifacts-'))
  try {
    const path = join(dir, 'judge.json')
    writeCapturedJson(path, JSON.stringify({ result: '{"score":8,"rationale":"потому что"}' }))

    const saved = readFileSync(path, 'utf8')
    assert.match(saved, /\n {2}"result": \{/, 'ожидается отступ, а не одна строка')
    assert.equal((JSON.parse(saved) as { result: { score: number } }).result.score, 8)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('не-JSON вывод сохраняется как есть — это диагностика', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-bench-artifacts-'))
  try {
    const path = join(dir, 'agent.json')
    writeCapturedJson(path, 'claude: command not found')
    assert.equal(readFileSync(path, 'utf8'), 'claude: command not found')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('текст ответа достаётся без экранирования', () => {
  assert.equal(resultText(JSON.stringify({ result: 'первая\nвторая' })), 'первая\nвторая\n')
  assert.equal(resultText(JSON.stringify({ result: '  ' })), undefined)
  assert.equal(resultText('не json'), undefined)
})

test('повторные хосты сводятся в одно правило, порядок сохраняется', () => {
  assert.deepEqual(
    uniqueHosts(['api.anthropic.com', 'registry.npmjs.org', ' ', 'registry.npmjs.org', '*.npmjs.org']),
    ['api.anthropic.com', 'registry.npmjs.org', '*.npmjs.org'],
  )
})
