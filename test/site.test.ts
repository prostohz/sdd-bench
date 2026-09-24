import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { ResultManifest, RunRecord, Verdict } from '../src/model/run.js'
import { renderMethodology } from '../src/site/methodology.js'
import { renderSite } from '../src/site/render.js'

function verdict(metric: Verdict['metric'], score: number): Verdict {
  return {
    metric,
    score,
    rationale: 'PRIVATE RATIONALE',
    findings: [],
    evidence: ['PRIVATE EVIDENCE'],
    judgeModel: 'judge',
  }
}

function fixture(stage: 'full' | 'spec' = 'full'): ResultManifest {
  const run: RunRecord = {
    runId: 'run-1',
    taskId: 'ledger-cli',
    taskClass: 'greenfield',
    stage,
    participantId: '<script>alert(1)</script>',
    repeat: 1,
    status: 'ok',
    statusDetail: undefined,
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:10:00Z',
    telemetry: {
      activeMs: 600000,
      durationMs: 600000,
      apiDurationMs: undefined,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 2,
      costUsd: 0.12,
      numTurns: 1,
    },
    baseline: undefined,
    hidden: {
      command: 'PRIVATE COMMAND',
      exitCode: 0,
      passRatio: 0.8,
      output: 'PRIVATE OUTPUT',
    },
    verdicts: {
      'spec-quality': verdict('spec-quality', 8),
      'spec-fit': verdict('spec-fit', 6),
      'impl-fit': verdict('impl-fit', 9),
    },
    versions: {},
  }
  return {
    resultId: 'sample',
    createdAt: '2026-01-01T00:00:00Z',
    config: {
      participantProvider: 'codex',
      participantModel: 'model',
      participantEffort: 'medium',
      judgeProvider: 'codex',
      judgeModel: 'judge',
      judgeEffort: 'medium',
      stage,
      timeoutMs: 1000,
      maxBudgetUsd: undefined,
      repeats: 1,
    },
    versions: {},
    runs: [run],
  }
}

test('публичная витрина показывает сводку и не раскрывает материалы запуска', () => {
  const html = renderSite(fixture())
  assert.match(html, /Рейтинг прогона/)
  assert.match(html, /Повторов: 1/)
  assert.match(html, /ledger-cli/)
  assert.match(html, /80%/)
  assert.match(html, /\$0\.12/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(
    html,
    /<script>alert\(1\)<\/script>|PRIVATE RATIONALE|PRIVATE EVIDENCE|PRIVATE OUTPUT|PRIVATE COMMAND/,
  )
})

test('этап спецификации не показывает оценку реализации', () => {
  const html = renderSite(fixture('spec'))
  assert.match(html, /Только спецификация/)
  assert.doesNotMatch(html, /<th scope="col" title="Соответствие реализации спецификации">/)
  assert.doesNotMatch(html, /<th scope="col">Скрытые тесты<\/th>/)
})

test('без результата витрина показывает пустое состояние', () => {
  const html = renderSite()
  assert.match(html, /Публичных прогонов пока нет/)
  assert.doesNotMatch(html, /href="#tasks"/)
})

test('полная методология строится из актуального Markdown и содержит навигацию', () => {
  const source = readFileSync('METHODOLOGY.md', 'utf8')
  const html = renderMethodology(source)
  assert.match(html, /Классы задач/)
  assert.match(html, /Протокол прогона/)
  assert.match(html, /Итоговый скор/)
  assert.match(html, /Как интерпретировать результат/)
  assert.match(html, /Изоляция запусков/)
  const sectionCount = [...source.matchAll(/^## /gm)].length
  assert.equal((html.match(/<h2 id="section-\d+">/g) ?? []).length, sectionCount)
  assert.match(html, new RegExp(`href="#section-${sectionCount}"`))
  assert.match(html, /Score_run = 100/)
  assert.match(html, /<table>/)
})

test('Markdown методологии не выполняет встроенный HTML', () => {
  const html = renderMethodology('# Методология\n\n## Проверка\n\n<script>alert(1)</script>')
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})
