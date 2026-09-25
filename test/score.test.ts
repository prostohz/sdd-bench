import assert from 'node:assert/strict'
import test from 'node:test'

import type { Metric, RunRecord, Verdict } from '../src/model/run.js'
import type { Stage } from '../src/model/stage.js'
import type { TaskClass } from '../src/model/task.js'
import { normalize, runCost, scoreParticipants, scoreRun } from '../src/score/score.js'

function verdict(metric: Metric, score: number): Verdict {
  return { metric, score, rationale: '', findings: [], evidence: [], judgeModel: 'judge' }
}

function record(over: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: 'task-participant-1',
    taskId: 'task',
    taskClass: 'greenfield' as TaskClass,
    stage: 'full' as Stage,
    participantId: 'participant',
    repeat: 1,
    status: 'ok',
    statusDetail: undefined,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:10:00.000Z',
    telemetry: {
      activeMs: 600_000,
      durationMs: 600_000,
      apiDurationMs: undefined,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 1500,
      costUsd: 1,
      numTurns: 1,
    },
    baseline: undefined,
    hidden: undefined,
    verdicts: { 'spec-quality': verdict('spec-quality', 10), 'spec-fit': verdict('spec-fit', 10), 'impl-fit': verdict('impl-fit', 10) },
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
    record({ verdicts: { 'spec-quality': verdict('spec-quality', 8), 'spec-fit': verdict('spec-fit', 5), 'impl-fit': verdict('impl-fit', 2) } }),
  )
  assert.equal(mixed.value?.toFixed(2), (100 * Math.cbrt(0.8 * 0.5 * 0.2)).toFixed(2))
})

test('нулевая метрика обнуляет весь запуск', () => {
  const zero = scoreRun(
    record({ verdicts: { 'spec-quality': verdict('spec-quality', 10), 'spec-fit': verdict('spec-fit', 10), 'impl-fit': verdict('impl-fit', 0) } }),
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
  const partial = scoreRun(record({ verdicts: { 'spec-quality': verdict('spec-quality', 10) } }))
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
      verdicts: { 'spec-quality': verdict('spec-quality', 0), 'spec-fit': verdict('spec-fit', 0), 'impl-fit': verdict('impl-fit', 0) },
    }),
  ]

  const [participant] = scoreParticipants(runs)
  assert.equal(participant?.tasks[0]?.score, 50)
})

test('эффективность считается по телеметрии и входит в скор', () => {
  const telemetry = {
    activeMs: 900_000,
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
  // Участник сказал минуту; харнесс намерил пятнадцать.
  assert.deepEqual(participant?.efficiency, {
    runs: 1,
    meanDurationMs: 900_000,
    meanTotalTokens: 1500,
    meanCostUsd: 2,
  })
})

test('время и цена дают по десять процентов внутри одной задачи', () => {
  const fast = record({ runId: 'fast', telemetry: { ...record().telemetry!, activeMs: 300_000, costUsd: 2 } })
  const cheap = record({ runId: 'cheap', participantId: 'other', telemetry: { ...record().telemetry!, activeMs: 600_000, costUsd: 1 } })
  const runs = [fast, cheap]
  assert.equal(scoreRun(fast, runs).value, 95)
  assert.equal(scoreRun(cheap, runs).value, 95)
  assert.equal(scoreRun(fast, runs).timeFactor, 1)
  assert.equal(scoreRun(fast, runs).costFactor, 0.5)
})

test('отсутствующая стоимость оставляет сравнение задачи без балла', () => {
  const known = record({ runId: 'known' })
  const unknown = record({ runId: 'unknown', participantId: 'other', telemetry: { ...record().telemetry!, costUsd: undefined } })
  assert.equal(scoreRun(known, [known, unknown]).value, null)
  assert.equal(scoreRun(unknown, [known, unknown]).value, null)
})

test('стоимость Codex оценивается по сохранённым ставкам с учётом кэша', () => {
  const run = record({ telemetry: {
    ...record().telemetry!,
    inputTokens: 2_000_000,
    cacheReadTokens: 1_000_000,
    cacheCreationTokens: 100_000,
    outputTokens: 1_000_000,
    costUsd: undefined,
  } })
  const pricing = { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.2, cacheWriteUsdPerMillion: 2.5, outputUsdPerMillion: 12 }
  assert.equal(runCost(run, pricing).value, 14.25)
  assert.equal(runCost(run, pricing).estimated, true)
  assert.equal(scoreRun(run, [run], pricing).value, 100)
})

test('этап spec оценивается по двум метрикам, без IS', () => {
  const specRun = record({
    stage: 'spec',
    verdicts: { 'spec-quality': verdict('spec-quality', 8), 'spec-fit': verdict('spec-fit', 5) },
  })

  // Среднее геометрическое двух, а не ноль за неприменимую IS.
  assert.equal(scoreRun(specRun).value?.toFixed(2), (100 * Math.sqrt(0.8 * 0.5)).toFixed(2))
})

test('на этапе spec вердикт IS ничего не меняет', () => {
  const withoutIS = scoreRun(record({ stage: 'spec', verdicts: { 'spec-quality': verdict('spec-quality', 8), 'spec-fit': verdict('spec-fit', 8) } }))
  const withIS = scoreRun(
    record({ stage: 'spec', verdicts: { 'spec-quality': verdict('spec-quality', 8), 'spec-fit': verdict('spec-fit', 8), 'impl-fit': verdict('impl-fit', 0) } }),
  )
  assert.equal(withoutIS.value, withIS.value)
})

test('незавершённое судейство этапа spec не считается нулём', () => {
  const partial = scoreRun(record({ stage: 'spec', verdicts: { 'spec-quality': verdict('spec-quality', 8) } }))
  assert.equal(partial.value, null)
})
