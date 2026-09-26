import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { ResultManifest, RunRecord, Verdict } from '../src/model/run.js'
import { renderReport } from '../src/report/report.js'
import { previewManifest } from '../src/site/data.js'
import { measurementId } from '../src/site/render/google-analytics.js'
import { renderMethodology } from '../src/site/render/methodology.js'
import { renderSite } from '../src/site/render/results.js'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

function withoutClasses(html: string): string {
  return html.replace(/ class="[^"]*"/g, '')
}

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
  const markup = withoutClasses(html)
  assert.match(
    markup,
    /<nav aria-label="Sections"><a href="\.\/index\.html" aria-current="page">Scores<\/a><a href="\.\/methodology\.html">Methodology<\/a><\/nav>/,
  )
  assert.match(markup, /<a href="\.\/index\.html">SDD BENCH<\/a>/)
  assert.match(html, /<title>Scores — SDD Bench<\/title>/)
  assert.doesNotMatch(html, /brand-mark/)
  assert.match(html, /Overall scores/)
  assert.doesNotMatch(html, /class="rank"|class="participant-id"|<th scope="col">#<\/th>/)
  assert.match(html, /<th[^>]*scope="col">Participant<\/th><th[^>]*scope="col">Score<\/th>/)
  assert.match(html, /Task breakdown/)
  assert.match(markup, /<div>Greenfield<\/div>/)
  assert.doesNotMatch(html, /<span>TASK 01<\/span>/)
  assert.match(html, /Run scores/)
  assert.ok(markup.includes('<div>VERSION <span>' + version + '</span></div>'))
  assert.match(markup, /<h1>From specification to <em>results\.<\/em><\/h1>/)
  assert.doesNotMatch(html, /RUN RESULT/)
  assert.doesNotMatch(html, /<footer|RESULT SET \/ 01|class="hero-stat"|class="method-note"/)
  assert.doesNotMatch(html, /OPEN BENCHMARK|topbar-badge|live-dot/)
  assert.doesNotMatch(html, /01 \/ SAME CONDITIONS|02 \/ ITEM-LEVEL JUDGING|03 \/ AGGREGATION/)
  assert.match(markup, /<h3>One starting point<\/h3>/)
  assert.match(markup, /<h3>Decisions before scores<\/h3>/)
  assert.match(markup, /<h3>Quality, time, and cost<\/h3>/)
  assert.doesNotMatch(html, /SPEC-DRIVEN DEVELOPMENT \/ BENCHMARK/)
  assert.doesNotMatch(html, /section-index/)
  assert.doesNotMatch(html, /January 1, 2026|Full workflow|Repeats: 1|class="hero-meta"/)
  assert.match(html, /ledger-cli/)
  assert.match(markup, /<span>ledger-cli<\/span>/)
  assert.doesNotMatch(html, /repeat 1/)
  assert.match(html, /80%/)
  assert.doesNotMatch(
    html,
    /Scores range from 0 to 100|<th scope="col">Status<\/th>|Judge scores use a 0–10 scale\./,
  )
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /<abbr[^>]*title="Quality of the specification itself">spec-quality<\/abbr>/)
  assert.match(html, /<abbr[^>]*title="How well the specification covers the task requirements">spec-fit<\/abbr>/)
  assert.match(html, /<abbr[^>]*title="How well the implementation follows the specification">impl-fit<\/abbr>/)
  assert.match(html, /<th[^>]*scope="col"[^>]*>Score<\/th>/)
  assert.match(html, /<th[^>]*scope="col"[^>]*><span[^>]*title="Share of held-out tests passed; reported separately from the score">Held-out tests<\/span><\/th>/)
  assert.match(html, /<th[^>]*scope="col"[^>]*>Avg\. time<\/th>/)
  assert.match(html, /<th[^>]*scope="col"[^>]*>Avg\. cost<\/th>/)
  assert.match(html, /<th[^>]*scope="col"[^>]*>Time<\/th><th[^>]*scope="col"[^>]*>Cost<\/th>/)
  assert.match(html, /<th[^>]*>Cost<\/th><th[^>]*><span[^>]*>Held-out tests<\/span><\/th><th[^>]*>Score<\/th>/)
  assert.match(html, /<td[^>]*>80%<\/td><td[^>]*>\d+\.\d<\/td>/)
  assert.match(html, /\$0\.120/)
  assert.match(html, /Held-out tests are reported separately from the score\./)
  assert.doesNotMatch(html, /Full methodology|class="method-link"/)
  assert.doesNotMatch(
    html,
    /<script>alert\(1\)<\/script>|PRIVATE RATIONALE|PRIVATE EVIDENCE|PRIVATE OUTPUT|PRIVATE COMMAND/,
  )
})

test('the dev preview keeps published scores without sending private artifacts', () => {
  const manifest = fixture()
  const preview = previewManifest(manifest)
  assert.ok(preview)
  assert.equal(renderSite(preview, version), renderSite(manifest, version))
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE RATIONALE|PRIVATE EVIDENCE|PRIVATE OUTPUT|PRIVATE COMMAND/)
})

test('the score page has no latest-run highlight', () => {
  const manifest = fixture()
  manifest.runs.push({
    ...manifest.runs[0]!,
    runId: 'gsd-run',
    participantId: 'gsd',
    finishedAt: '2026-01-02T11:09:48Z',
    telemetry: { ...manifest.runs[0]!.telemetry!, activeMs: 2_323_498 },
  })
  const html = withoutClasses(renderSite(manifest, version))
  const hero = html.split('</section>')[0]!
  assert.doesNotMatch(hero, /Latest completed run|2026-01-02|GSD Core|View run scores/)
  assert.match(html, /GSD Core/)
  assert.match(html, /38\.7 min/)
})

test('published pages use a versioned stylesheet URL', () => {
  assert.match(renderSite(fixture(), version, 'abc123'), /href="\.\/site\.css\?v=abc123"/)
  assert.match(renderMethodology('# Methodology', 'abc123'), /href="\.\/site\.css\?v=abc123"/)
})

test('both published pages send page views to the same GA4 stream', () => {
  for (const html of [renderSite(fixture(), version), renderMethodology('# Methodology')]) {
    assert.equal(html.split(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`).length - 1, 1)
    assert.equal(html.split(`gtag('config','${measurementId}')`).length - 1, 1)
  }
})

test('estimated costs have no prefix in site or report', () => {
  const manifest = fixture()
  manifest.config.participantPricing = {
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.2,
    cacheWriteUsdPerMillion: 2.5,
    outputUsdPerMillion: 12,
  }
  manifest.runs[0]!.telemetry = {
    ...manifest.runs[0]!.telemetry!,
    inputTokens: 100_000,
    outputTokens: 10_000,
    cacheReadTokens: 0,
    totalTokens: 110_000,
    costUsd: undefined,
  }
  for (const output of [renderSite(manifest, version), renderReport(manifest)]) {
    assert.doesNotMatch(output, /[~≈]\$?0\.32/)
  }
  assert.match(renderSite(manifest, version), /\$0\.320/)
})

test('the specification stage omits implementation checks', () => {
  const html = renderSite(fixture('spec'), version)
  assert.doesNotMatch(html, /Specification only|class="hero-meta"/)
  assert.match(html, /spec-quality/)
  assert.doesNotMatch(html, /<abbr[^>]*>impl-fit<\/abbr>/)
  assert.doesNotMatch(html, /<th[^>]*><span[^>]*>Held-out tests<\/span><\/th>/)
  assert.match(withoutClasses(html), /<div><h2>Run scores<\/h2><\/div>/)
})

test('run scores identify repeats when a result includes multiple attempts', () => {
  const manifest = fixture('spec')
  manifest.config.repeats = 2
  manifest.runs.push({ ...manifest.runs[0]!, runId: 'run-2', repeat: 2 })
  const html = renderSite(manifest, version)
  assert.match(html, /ledger-cli · repeat 1/)
  assert.match(html, /ledger-cli · repeat 2/)
})

test('the baseline appears first even when another method scores higher', () => {
  const manifest = fixture('spec')
  const high = { ...manifest.runs[0]!, runId: 'bmad-run', participantId: 'bmad' }
  const low = {
    ...manifest.runs[0]!,
    runId: 'baseline-run',
    participantId: 'neutral',
    verdicts: {
      'spec-quality': verdict('spec-quality', 1),
      'spec-fit': verdict('spec-fit', 1),
    },
  }
  manifest.runs = [high, low]

  const html = withoutClasses(renderSite(manifest, version))
  assert.match(html, /<tbody[^>]*><tr[^>]*><th scope="row"><span>Baseline<\/span>/s)
  assert.match(html, /<h3>ledger-cli<\/h3><p>[^<]+<\/p><div><div><span>Baseline<\/span>/)
  assert.match(html, /<tbody[^>]*><tr[^>]*><td[^>]*><strong>Baseline<\/strong>/s)
})

test('saved tool versions appear in each report view', () => {
  const manifest = fixture('spec')
  const first = manifest.runs[0]!
  first.participantId = 'openspec'
  first.versions = { openspec: '1.13.2' }
  manifest.runs.push({ ...first, runId: 'run-2', repeat: 2, versions: { openspec: '1.14.0' } })
  manifest.runs.push({ ...first, runId: 'run-3', participantId: 'canon', versions: { canon: '@canon/cli      0.1.0' } })

  const site = renderSite(manifest, version)
  assert.match(withoutClasses(site), /<span>Tool version: <span>1\.13\.2, 1\.14\.0<\/span><\/span>/)
  assert.match(withoutClasses(site), /<span>Tool version: <span>0\.1\.0<\/span><\/span>/)

  const report = renderReport(manifest)
  assert.match(report, /\| Запуск \| Версия инструмента \| Статус \|/)
  assert.match(report, /ledger-cli \/ openspec \/ 1 \| 1\.13\.2 \|/)
})

test('methodology names open their GitHub repositories in a new tab', () => {
  const manifest = fixture('spec')
  const ids = ['openspec', 'speckit', 'bmad', 'gsd', 'canon', 'neutral']
  manifest.runs = ids.map((participantId, index) => ({
    ...manifest.runs[0]!,
    runId: `run-${index}`,
    participantId,
  }))
  const html = renderSite(manifest, version)
  const repositories = [
    'https://github.com/Fission-AI/OpenSpec',
    'https://github.com/github/spec-kit',
    'https://github.com/bmad-code-org/BMAD-METHOD',
    'https://github.com/open-gsd/gsd-core',
    'https://github.com/prostohz/canon',
  ]
  for (const repository of repositories) {
    assert.equal(html.split(`href="${repository}" target="_blank" rel="noopener noreferrer"`).length - 1, 3)
  }
  assert.match(withoutClasses(html), /<span>Baseline<\/span>/)
  assert.doesNotMatch(html, /href="[^"]*neutral/)
})

test('the site shows an empty state without a result', () => {
  const html = renderSite(undefined, version)
  assert.match(
    withoutClasses(html),
    /<nav aria-label="Sections"><a href="\.\/index\.html" aria-current="page">Scores<\/a><a href="\.\/methodology\.html">Methodology<\/a><\/nav>/,
  )
  assert.match(html, /No data yet\./)
  assert.match(html, /From specification to/)
  assert.match(html, /How to read this result/)
  assert.doesNotMatch(html, /Overall scores|Task breakdown|Run scores/)
  assert.doesNotMatch(html, /<footer/)
  assert.doesNotMatch(html, /SPEC-DRIVEN DEVELOPMENT \/ BENCHMARK/)
  assert.doesNotMatch(html, /section-index/)
  assert.doesNotMatch(html, /href="#tasks"/)
})

test('the site shows an empty state when a result has no runs', () => {
  const manifest = fixture()
  manifest.runs = []
  const html = renderSite(manifest, version)
  assert.match(html, /No data yet\./)
  assert.match(html, /From specification to/)
  assert.match(html, /How to read this result/)
  assert.doesNotMatch(html, /Overall scores|Task breakdown|Run scores/)
})

test('the methodology page renders the current Markdown with navigation', () => {
  const source = readFileSync('METHODOLOGY.md', 'utf8')
  const html = renderMethodology(source)
  const markup = withoutClasses(html)
  assert.match(
    markup,
    /<nav aria-label="Sections"><a href="\.\/index\.html">Scores<\/a><a href="\.\/methodology\.html" aria-current="page">Methodology<\/a><\/nav>/,
  )
  assert.match(markup, /<a href="\.\/index\.html">SDD BENCH<\/a>/)
  assert.doesNotMatch(html, /Back to scores|class="toc-back"/)
  assert.doesNotMatch(html, /brand-mark/)
  assert.match(html, /Task classes/)
  assert.match(markup, /<ul><li><a href="#section-1">Task classes<\/a><\/li>/)
  assert.doesNotMatch(html, /Workflow stages/)
  assert.match(html, /<h2 id="section-2">Run protocol<\/h2>/)
  assert.match(html, /<h2 id="section-3">Agent configuration<\/h2>/)
  assert.doesNotMatch(html, /ON THIS PAGE|class="toc-label"|<a href="#section-1"><span>/)
  assert.doesNotMatch(html, /<h1 class="methodology-title">/)
  assert.doesNotMatch(html, /methodology-hero|methodology-sequence/)
  assert.doesNotMatch(html, /<footer/)
  assert.doesNotMatch(html, /OPEN BENCHMARK|topbar-badge|live-dot/)
  assert.match(html, /Run protocol/)
  assert.match(html, /Aggregate score/)
  assert.match(html, /Interpreting results/)
  assert.match(html, /Run isolation/)
  assert.match(markup, /<li><a href="#section-7">Run isolation<\/a><\/li><li><a href="#section-8">Interpreting results<\/a><\/li><\/ul>/)
  const sectionCount = [...source.matchAll(/^## /gm)].length - 1
  assert.equal((html.match(/<h2 id="section-\d+">/g) ?? []).length, sectionCount)
  assert.match(html, new RegExp(`href="#section-${sectionCount}"`))
  assert.match(html, /<link rel="stylesheet" href="\.\/katex\/katex\.min\.css">/)
  assert.match(html, /<div class="[^"]*overflow-x-auto[^"]*"><span class="katex-display">/)
  assert.match(html, /class="katex-mathml"/)
  assert.doesNotMatch(html, /<pre><code class="language-math">/)
  assert.match(html, /<table>/)
})

test('methodology Markdown escapes embedded HTML', () => {
  const html = renderMethodology('# Methodology\n\n## Check\n\n<script>alert(1)</script>')
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
})
