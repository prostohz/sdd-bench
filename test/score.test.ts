import assert from 'node:assert/strict'
import test from 'node:test'

import type { Metric, RunRecord, Verdict } from '../src/model/run.js'
import type { TaskClass } from '../src/model/task.js'
import { normalize, scoreParticipants, scoreRun } from '../src/score/score.js'

function verdict(metric: Metric, score: number): Verdict {
  return { metric, score, rationale: '', evidence: [], judgeModel: 'judge' }
}

function record(over: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: 'task-participant-1',
    taskId: 'task',
    taskClass: 'greenfield' as TaskClass,
    participantId: 'participant',
    repeat: 1,
    status: 'ok',
    statusDetail: undefined,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:10:00.000Z',
    telemetry: undefined,
    baseline: undefined,
    hidden: undefined,
    verdicts: { Q: verdict('Q', 10), SR: verdict('SR', 10), IS: verdict('IS', 10) },
    versions: {},
    ...over,
  }
}

test('нормировка переводит рубрику 0..10 в 0..1', () => {
  assert.equal(normalize(0), 0)
  assert.equal(normalize(5), 0.5)
  assert.equal(normalize(10), 1)
  assert.equal(normalize(12), 1, 'оценка выше шкалы обрезается')
})

test('скор запуска — геометрическое среднее трёх метрик', () => {
  assert.equal(scoreRun(record()).value, 100)

  const mixed = scoreRun(
    record({ verdicts: { Q: verdict('Q', 8), SR: verdict('SR', 5), IS: verdict('IS', 2) } }),
  )
  assert.equal(mixed.value?.toFixed(2), (100 * Math.cbrt(0.8 * 0.5 * 0.2)).toFixed(2))
})

test('нулевая метрика обнуляет весь запуск', () => {
  const zero = scoreRun(
    record({ verdicts: { Q: verdict('Q', 10), SR: verdict('SR', 10), IS: verdict('IS', 0) } }),
  )
  assert.equal(zero.value, 0)
})

test('ошибка и таймаут дают ноль независимо от оценок', () => {
  const failed = scoreRun(record({ status: 'error', statusDetail: 'упал' }))
  assert.equal(failed.value, 0)
  assert.equal(failed.zeroReason, 'упал')
  assert.equal(scoreRun(record({ status: 'timeout' })).value, 0)
})

test('регрессия обнуляет brownfield-запуск и не трогает greenfield', () => {
  const baseline = { command: 'npm test', exitCode: 1, passRatio: 0.75, output: '' }

  const brownfield = scoreRun(record({ taskClass: 'brownfield-nospec', baseline }))
  assert.equal(brownfield.value, 0)
  assert.match(brownfield.zeroReason ?? '', /регрессия: прошло 75%/)

  assert.equal(scoreRun(record({ taskClass: 'greenfield', baseline })).value, 100)
})

test('неоценённый запуск не считается нулём', () => {
  const partial = scoreRun(record({ verdicts: { Q: verdict('Q', 10) } }))
  assert.equal(partial.value, null)
  assert.equal(partial.zeroReason, undefined)
})

test('итог участника — среднее по классам, а не по задачам', () => {
  // Два greenfield-запуска по 100 и один brownfield-запуск с нулём: среднее по
  // задачам дало бы 66.7, среднее по классам — 50.
  const runs = [
    record({ runId: 'a-p-1', taskId: 'a' }),
    record({ runId: 'b-p-1', taskId: 'b' }),
    record({
      runId: 'c-p-1',
      taskId: 'c',
      taskClass: 'brownfield-nospec',
      status: 'timeout',
    }),
  ]

  const [participant] = scoreParticipants(runs)
  assert.equal(participant?.score, 50)
  assert.deepEqual(
    participant?.classes.map((c) => [c.key, c.score]),
    [
      ['brownfield-nospec', 0],
      ['greenfield', 100],
    ],
  )
})

test('повторы одной задачи усредняются', () => {
  const runs = [
    record({ runId: 'a-p-1', repeat: 1 }),
    record({
      runId: 'a-p-2',
      repeat: 2,
      verdicts: { Q: verdict('Q', 0), SR: verdict('SR', 0), IS: verdict('IS', 0) },
    }),
  ]

  const [participant] = scoreParticipants(runs)
  assert.equal(participant?.tasks[0]?.score, 50)
})

test('эффективность считается по телеметрии и в скор не входит', () => {
  const telemetry = {
    durationMs: 60_000,
    apiDurationMs: 50_000,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 1500,
    costUsd: 2,
    numTurns: 4,
  }

  const [participant] = scoreParticipants([record({ telemetry })])
  assert.equal(participant?.score, 100)
  assert.deepEqual(participant?.efficiency, {
    runs: 1,
    meanDurationMs: 60_000,
    meanTotalTokens: 1500,
    meanCostUsd: 2,
  })
})
