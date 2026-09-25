import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resultText, writeCapturedJson } from '../src/artifacts.js'

import { parseVerdict } from '../src/judge/judge.js'
import { parseClaudeResult } from '../src/run/claude.js'
import { parseCodexResult } from '../src/run/codex.js'
import { passRatio } from '../src/run/projectTests.js'
import { run } from '../src/proc.js'
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

const CODEX_EVENTS = [
  { type: 'thread.started', thread_id: 'test' },
  { type: 'turn.started' },
  { type: 'item.completed', item: { id: 'message', type: 'agent_message', text: '{"ok":true}' } },
  { type: 'turn.completed', usage: { input_tokens: 1200, cached_input_tokens: 400, output_tokens: 80 } },
].map((event) => JSON.stringify(event)).join('\n')

test('Codex JSONL отдаёт итоговый ответ и телеметрию без двойного счёта кэша', () => {
  const parsed = parseCodexResult(CODEX_EVENTS, 5000)
  assert.equal(parsed.text, '{"ok":true}')
  assert.equal(parsed.telemetry.activeMs, 5000)
  assert.equal(parsed.telemetry.totalTokens, 1280)
  assert.equal(parsed.telemetry.cacheReadTokens, 400)
  assert.equal(parsed.isError, false)
})

test('ошибка Codex не принимается за успешный ответ', () => {
  const output = [
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'turn.failed', error: { message: 'модель недоступна' } }),
  ].join('\n')
  const parsed = parseCodexResult(output, 5000)
  assert.equal(parsed.isError, true)
  assert.equal(parsed.text, 'модель недоступна')
  assert.throws(() => parseCodexResult('{"type":"turn.started"}', 5000), /не содержит завершения/)
})

test('ответ Codex сохраняется вместе с событиями и читается для пересчёта', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-bench-codex-artifacts-'))
  try {
    const path = join(dir, 'judge.json')
    writeCapturedJson(path, CODEX_EVENTS)
    const saved = JSON.parse(readFileSync(path, 'utf8')) as { result: { ok: boolean }; events: unknown[] }
    assert.equal(saved.result.ok, true)
    assert.equal(saved.events.length, 4)
    assert.equal(resultText(CODEX_EVENTS), '{"ok":true}\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
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

test('время меряет харнесс, а не участник', () => {
  // Делегирующий подагентам участник занижает собственный duration_ms.
  const parsed = parseClaudeResult(ENVELOPE, 1_200_000)
  assert.equal(parsed.telemetry.durationMs, 754_000, 'сказанное участником сохраняется')
  assert.equal(parsed.telemetry.activeMs, 1_200_000, 'сравнивают по измеренному')
})

test('доля прошедших тестов — из счётчиков, иначе по коду возврата', () => {
  const pattern = 'passed (\\d+) of (\\d+)'
  assert.equal(passRatio(1, 'passed 9 of 12', pattern), 0.75)
  assert.equal(passRatio(0, 'нет счётчиков', pattern), 1)
  assert.equal(passRatio(1, 'нет счётчиков', pattern), 0)
  assert.equal(passRatio(0, '', undefined), 1)
})

test('ответ судьи не в виде вердикта — ошибка', () => {
  assert.throws(() => parseVerdict('не могу оценить', 'impl-fit'), /судья impl-fit/)
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

test('сон хоста не расходует лимит и не попадает в замер', async () => {
  // Команда спит дольше тика: сам прогон короткий, но между тиками пройдёт
  // время. Активное время не должно превысить календарное.
  const result = await run('bash', ['-c', 'sleep 0.2'], { timeoutMs: 60_000 })

  assert.equal(result.code, 0)
  assert.equal(result.timedOut, false)
  assert.ok(result.activeMs <= result.durationMs, 'активное время не больше календарного')
  assert.ok(result.durationMs >= 200, 'календарное время измерено')
})

test('лимит расходуется и обрывает команду', async () => {
  const result = await run('bash', ['-c', 'sleep 30'], { timeoutMs: 2500 })

  assert.equal(result.timedOut, true)
  assert.ok(result.activeMs >= 2000, `ожидается расход лимита, получено ${result.activeMs}`)
  assert.ok(result.durationMs < 20_000, 'команда оборвана, а не досижена до конца')
})

test('нулевой лимит не обрывает команду', async () => {
  const result = await run('bash', ['-c', 'sleep 0.1'], { timeoutMs: 0 })

  assert.equal(result.code, 0)
  assert.equal(result.timedOut, false)
})
