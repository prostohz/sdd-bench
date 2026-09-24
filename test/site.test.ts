import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { ResultManifest, RunRecord, Verdict } from '../src/model/run.js'
import { renderMethodology } from '../src/site/methodology.js'
import { renderSite } from '../src/site/render.js'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

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
      provider: 'codex',
      participantModel: 'model',
      participantEffort: 'medium',
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

test('the public site shows summaries without exposing run artifacts', () => {
  const html = renderSite(fixture(), version)
  assert.match(
    html,
    /<nav aria-label="Sections"><a href="\.\/index\.html" aria-current="page">Scores<\/a><a href="\.\/methodology\.html">Methodology<\/a><\/nav>/,
  )
  assert.match(html, /<a class="brand" href="\.\/index\.html">SDD BENCH<\/a>/)
  assert.match(html, /<title>Scores — SDD Bench<\/title>/)
  assert.doesNotMatch(html, /brand-mark/)
  assert.match(html, /Overall scores/)
  assert.doesNotMatch(html, /class="rank"|class="participant-id"|<th scope="col">#<\/th>/)
  assert.match(html, /<th scope="col">Participant<\/th><th scope="col">Score<\/th>/)
  assert.match(html, /Task breakdown/)
  assert.match(html, /Run scores/)
  assert.ok(html.includes('<div class="edition">VERSION <span>' + version + '</span></div>'))
  assert.match(html, /<h1>From specification to <em>results\.<\/em><\/h1>/)
  assert.doesNotMatch(html, /RUN RESULT/)
  assert.doesNotMatch(html, /<footer|RESULT SET \/ 01|class="hero-stat"|class="method-note"/)
  assert.doesNotMatch(html, /OPEN BENCHMARK|topbar-badge|live-dot/)
  assert.doesNotMatch(html, /01 \/ SAME CONDITIONS|02 \/ ITEM-LEVEL JUDGING|03 \/ AGGREGATION/)
  assert.match(html, /<h3>One starting point<\/h3>/)
  assert.match(html, /<h3>Decisions before scores<\/h3>/)
  assert.match(html, /<h3>Equal class weights<\/h3>/)
  assert.doesNotMatch(html, /SPEC-DRIVEN DEVELOPMENT \/ BENCHMARK/)
  assert.doesNotMatch(html, /section-index/)
  assert.doesNotMatch(html, /January 1, 2026|Full workflow|Repeats: 1|class="hero-meta"/)
  assert.match(html, /ledger-cli/)
  assert.match(html, /80%/)
  assert.doesNotMatch(
    html,
    /Scores range from 0 to 100|Avg\. time|Avg\. cost|<th scope="col">Status<\/th>|Judge scores use a 0–10 scale\.|\$0\.12/,
  )
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /<th scope="col" class="number" title="Specification quality">spec-quality<\/th>/)
  assert.match(html, /<th scope="col" class="number">Score<\/th>/)
  assert.match(html, /<th scope="col" class="number">Held-out tests<\/th>/)
  assert.match(html, /Held-out tests are reported separately from the score\./)
  assert.doesNotMatch(html, /Full methodology|class="method-link"/)
  assert.doesNotMatch(
    html,
    /<script>alert\(1\)<\/script>|PRIVATE RATIONALE|PRIVATE EVIDENCE|PRIVATE OUTPUT|PRIVATE COMMAND/,
  )
})

test('the specification stage omits implementation checks', () => {
  const html = renderSite(fixture('spec'), version)
  assert.doesNotMatch(html, /Specification only|class="hero-meta"/)
  assert.match(html, /spec-quality/)
  assert.doesNotMatch(html, /<th[^>]*title="Implementation fit to specification">/)
  assert.doesNotMatch(html, /<th[^>]*>Held-out tests<\/th>/)
  assert.match(html, /<div class="section-head"><h2>Run scores<\/h2><\/div>/)
})

test('the site shows an empty state without a result', () => {
  const html = renderSite(undefined, version)
  assert.match(
    html,
    /<nav aria-label="Sections"><a href="\.\/index\.html" aria-current="page">Scores<\/a><a href="\.\/methodology\.html">Methodology<\/a><\/nav>/,
  )
  assert.match(html, /No public runs yet/)
  assert.doesNotMatch(html, /<footer/)
  assert.doesNotMatch(html, /SPEC-DRIVEN DEVELOPMENT \/ BENCHMARK/)
  assert.doesNotMatch(html, /section-index/)
  assert.doesNotMatch(html, /href="#tasks"/)
})

test('the methodology page renders the current Markdown with navigation', () => {
  const source = readFileSync('METHODOLOGY.md', 'utf8')
  const html = renderMethodology(source)
  assert.match(
    html,
    /<nav aria-label="Sections"><a href="\.\/index\.html">Scores<\/a><a href="\.\/methodology\.html" aria-current="page">Methodology<\/a><\/nav>/,
  )
  assert.match(html, /<a class="brand" href="\.\/index\.html">SDD BENCH<\/a>/)
  assert.match(html, /← Back to scores/)
  assert.doesNotMatch(html, /brand-mark/)
  assert.match(html, /Task classes/)
  assert.match(html, /<ul><li><a href="#section-1">Task classes<\/a><\/li>/)
  assert.doesNotMatch(html, /ON THIS PAGE|class="toc-label"|<a href="#section-1"><span>/)
  assert.match(html, /<div class="methodology-layout"><h1 class="methodology-title">Methodology<\/h1>/)
  assert.doesNotMatch(html, /methodology-hero|methodology-sequence/)
  assert.doesNotMatch(html, /<footer/)
  assert.doesNotMatch(html, /OPEN BENCHMARK|topbar-badge|live-dot/)
  assert.match(html, /Run protocol/)
  assert.match(html, /Aggregate score/)
  assert.match(html, /Interpreting results/)
  assert.match(html, /Run isolation/)
  const sectionCount = [...source.matchAll(/^## /gm)].length
  assert.equal((html.match(/<h2 id="section-\d+">/g) ?? []).length, sectionCount)
  assert.match(html, new RegExp(`href="#section-${sectionCount}"`))
  assert.match(html, /Score_run = 100/)
  assert.match(html, /<table>/)
})

test('methodology Markdown escapes embedded HTML', () => {
  const html = renderMethodology('# Methodology\n\n## Check\n\n<script>alert(1)</script>')
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})
