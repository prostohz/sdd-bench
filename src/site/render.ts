import type { Metric, ResultManifest, RunRecord } from '../model/run.js'
import { DEFAULT_STAGE, STAGE_METRICS, type Stage } from '../model/stage.js'
import { scoreParticipants, scoreRun } from '../score/score.js'
const STAGE_LABELS: Record<Stage, string> = {
  full: 'Full workflow',
  spec: 'Specification only',
}
const METRIC_LABELS: Record<Metric, string> = {
  'spec-quality': 'Specification quality',
  'spec-fit': 'Specification fit to requirements',
  'impl-fit': 'Implementation fit to specification',
}
const NAMES: Record<string, string> = {
  neutral: 'Neutral SDD',
  openspec: 'OpenSpec',
  speckit: 'Spec Kit',
  canon: 'Canon',
  bmad: 'BMad Method',
}
const CLASS_NAMES: Record<string, string> = {
  greenfield: 'Greenfield',
  'brownfield-nospec': 'Brownfield · no specification',
  'brownfield-spec': 'Brownfield · current specification',
}
function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
function score(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}
function bar(value: number | null, className = ''): string {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value))
  return `<span class="bar ${className}" aria-hidden="true"><span style="width:${width}%"></span></span>`
}
function date(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? esc(value)
    : new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(parsed)
}
function duration(ms: number | null): string {
  return ms === null ? '—' : `${Math.round(ms / 60000)} min`
}
function sectionHead(index: string, title: string, note: string): string {
  return `<div class="section-head"><span class="section-index">${index}</span><div><h2>${title}</h2><p>${note}</p></div></div>`
}
export function siteHeader(hasResults: boolean, current: 'home' | 'methodology' = 'home'): string {
  const home = current === 'home'
  return `<header class="topbar"><a class="brand" href="./index.html" aria-label="SDD Bench home"><span class="brand-mark">S<span>/</span>D</span><span>SDD BENCH</span></a><nav aria-label="Sections"><a href="${home ? '#results' : './index.html#results'}">Results</a>${hasResults ? `<a href="${home ? '#tasks' : './index.html#tasks'}">Tasks</a>` : ''}<a href="${home ? './methodology.html' : '#top'}"${home ? '' : ' aria-current="page"'}>Methodology</a></nav><span class="topbar-badge">OPEN BENCHMARK <span class="live-dot"></span></span></header>`
}
function empty(): string {
  return `<main id="top"><section class="hero empty-hero"><div class="hero-kicker"><span class="kicker-line"></span> SPEC-DRIVEN DEVELOPMENT / BENCHMARK</div><div class="hero-layout"><div><h1>From intent<br>to working<br><em>code.</em></h1><p class="hero-intro">Comparing specification-driven workflows by specification quality, implementation fidelity, and effort.</p><a class="hero-link" href="./methodology.html">How the benchmark works <span aria-hidden="true">↗</span></a></div><div class="hero-art" aria-hidden="true"><div class="art-caption">BENCHMARK PIPELINE <span>01 / 03</span></div><div class="art-step"><span>01</span><strong>Intent</strong><i></i></div><div class="art-step"><span>02</span><strong>Specification</strong><i></i></div><div class="art-step"><span>03</span><strong>Implementation</strong><i></i></div><div class="art-bottom">INTENT <span>→</span> SPEC <span>→</span> CODE</div></div></div></section><section id="results" class="content empty-state"><div class="section-head"><span class="section-index">01</span><div><h2>Results</h2><p>No public runs yet.</p></div></div><div class="empty-panel"><div class="empty-icon">∅</div><div><h3>The first result is in progress</h3><p>Once a run is complete and reviewed, participant scores and task comparisons will appear here.</p></div><span class="empty-label">AWAITING DATA</span></div></section>${method('02')}</main>`
}
function summary(manifest: ResultManifest): string {
  const participants = scoreParticipants(manifest.runs)
  const scored = manifest.runs.filter((run) => scoreRun(run).value !== null).length
  const taskCount = new Set(manifest.runs.map((run) => run.taskId)).size
  const stage = manifest.config.stage ?? DEFAULT_STAGE
  return `<section class="hero results-hero"><div class="hero-kicker"><span class="kicker-line"></span> SPEC-DRIVEN DEVELOPMENT / BENCHMARK</div><div class="results-hero-grid"><div><div class="edition">RUN RESULT <span>${esc(manifest.resultId)}</span></div><h1>From specification<br>to <em>results.</em></h1><p class="hero-intro">SDD workflows compared on the same tasks, model, and settings. Scores are calculated from saved item-level judgments.</p><div class="hero-meta"><span>${date(manifest.createdAt)}</span><span>${esc(STAGE_LABELS[stage])}</span><span>${esc(manifest.config.participantModel)}</span><span>Repeats: ${manifest.config.repeats}</span></div></div><div class="hero-stat"><span class="hero-stat-label">RESULT SET / 01</span><strong>${participants.length.toString().padStart(2, '0')}</strong><span>participants</span><div class="stat-rule"></div><div class="hero-stat-secondary"><div><b>${taskCount.toString().padStart(2, '0')}</b><span>${taskCount === 1 ? "task" : "tasks"}</span></div><div><b>${scored}<small>/${manifest.runs.length}</small></b><span>runs scored</span></div></div></div></div></section>`
}
function leaderboard(manifest: ResultManifest): string {
  const ranked = scoreParticipants(manifest.runs).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const classes = [...new Set(manifest.runs.map((run) => run.taskClass))].sort()
  const rows = ranked
    .map((participant, index) => {
      const classCells = classes
        .map((key) => {
          const value = participant.classes.find((item) => item.key === key)?.score ?? null
          return `<td class="class-cell"><span>${score(value)}</span>${bar(value)}</td>`
        })
        .join('')
      const cost = participant.efficiency.meanCostUsd
      return `<tr><td class="rank">${String(index + 1).padStart(2, '0')}</td><th scope="row"><span class="participant-name">${esc(NAMES[participant.participantId] ?? participant.participantId)}</span><span class="participant-id">${esc(participant.participantId)}</span></th><td class="total-cell"><strong>${score(participant.score)}</strong><span>/ 100</span></td>${classCells}<td class="efficiency">${duration(participant.efficiency.meanDurationMs)}</td><td class="efficiency">${cost === null ? '—' : `$${cost.toFixed(2)}`}</td></tr>`
    })
    .join('')
  return `<section class="content" id="results">${sectionHead('01', 'Run ranking', 'Mean across included task classes. Time and cost are reported separately.')}<div class="table-shell"><table class="leaderboard"><thead><tr><th scope="col">#</th><th scope="col">Participant</th><th scope="col">Score</th>${classes.map((key) => `<th scope="col">${esc(CLASS_NAMES[key] ?? key)}</th>`).join('')}<th scope="col">Avg. time</th><th scope="col">Avg. cost</th></tr></thead><tbody>${rows}</tbody></table></div><p class="table-footnote">Scores range from 0 to 100 · “—” means no data.</p></section>`
}
function tasks(manifest: ResultManifest): string {
  const participants = scoreParticipants(manifest.runs).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const taskIds = [...new Set(manifest.runs.map((run) => run.taskId))].sort()
  const cards = taskIds
    .map((taskId, index) => {
      const taskClass = manifest.runs.find((run) => run.taskId === taskId)?.taskClass ?? ''
      const rows = participants
        .map((participant) => {
          const task = participant.tasks.find((item) => item.key === taskId)
          const value = task?.score ?? null
          return `<div class="task-row"><span>${esc(NAMES[participant.participantId] ?? participant.participantId)}</span>${bar(value)}<strong>${score(value)}</strong></div>`
        })
        .join('')
      return `<article class="task-card"><div class="task-top"><span>TASK ${String(index + 1).padStart(2, '0')}</span><span>${esc(CLASS_NAMES[taskClass] ?? taskClass)}</span></div><h3>${esc(taskId)}</h3><p>Mean score across repeats</p><div class="task-bars">${rows}</div></article>`
    })
    .join('')
  return `<section class="content task-section" id="tasks">${sectionHead('02', 'By task', 'Each card shows a participant’s mean score across repeats for one task.')}<div class="task-grid">${cards}</div></section>`
}
function runStatus(run: RunRecord): string {
  const scored = scoreRun(run)
  if (scored.value === null) return '<span class="status pending">Awaiting judgment</span>'
  if (scored.zeroReason) return '<span class="status failed">Zero score</span>'
  return '<span class="status complete">Scored</span>'
}
function runs(manifest: ResultManifest): string {
  const stage = manifest.config.stage ?? DEFAULT_STAGE
  const metrics = STAGE_METRICS[stage]
  const showHidden = stage === 'full'
  const note = showHidden
    ? 'Judge scores use a 0–10 scale. Held-out tests are reported separately from the score.'
    : 'Judge scores use a 0–10 scale.'
  const rows = [...manifest.runs]
    .sort(
      (a, b) =>
        a.taskId.localeCompare(b.taskId) ||
        a.participantId.localeCompare(b.participantId) ||
        a.repeat - b.repeat,
    )
    .map((run) => {
      const value = scoreRun(run)
      const cells = metrics
        .map(
          (metric) =>
            `<td class="number">${run.verdicts[metric] === undefined ? '—' : score(run.verdicts[metric]?.score ?? null)}</td>`,
        )
        .join('')
      const hidden = run.hidden?.passRatio
      const hiddenCell = showHidden
        ? `<td class="number">${hidden === undefined ? '—' : `${Math.round(hidden * 100)}%`}</td>`
        : ''
      return `<tr><td><strong>${esc(NAMES[run.participantId] ?? run.participantId)}</strong><span class="run-sub">${esc(run.taskId)} · repeat ${run.repeat}</span></td>${cells}<td class="number run-score">${score(value.value)}</td>${hiddenCell}<td>${runStatus(run)}</td></tr>`
    })
    .join('')
  return `<section class="content runs-section" id="runs">${sectionHead('03', 'All runs', note)}<div class="table-shell"><table class="runs-table"><thead><tr><th scope="col">Run</th>${metrics.map((metric) => `<th scope="col" class="number" title="${esc(METRIC_LABELS[metric])}">${esc(metric)}</th>`).join('')}<th scope="col" class="number">Score</th>${showHidden ? '<th scope="col" class="number">Held-out tests</th>' : ''}<th scope="col">Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`
}
function method(index = '04'): string {
  return `<section class="method" id="method"><div class="content">${sectionHead(index, 'How to read this result', 'How scores are calculated and where comparisons apply.')}<div class="method-grid"><div class="method-item"><span>01 / SAME CONDITIONS</span><h3>One starting point</h3><p>Participants receive the same task, model, and limits. Only the SDD workflow and its tools differ.</p></div><div class="method-item"><span>02 / ITEM-LEVEL JUDGING</span><h3>Decisions before scores</h3><p>Judges assess individual requirements and defects. The harness calculates scores from those decisions.</p></div><div class="method-item"><span>03 / AGGREGATION</span><h3>Equal class weights</h3><p>A run score is the geometric mean of applicable metrics. Repeats average into tasks, tasks into classes, and classes into the final score.</p></div></div><div class="method-note"><span>METHODOLOGY</span><p>Failure, timeout, or regression of original tests gives a run zero. Time and held-out tests do not affect the score. The specification-only stage omits implementation fit.</p></div><a class="method-link" href="./methodology.html">Full methodology <span aria-hidden="true">↗</span></a></div></section>`
}
export function siteFooter(manifest?: ResultManifest): string {
  return `<footer class="footer"><span class="brand-mark">S<span>/</span>D</span><div><strong>SDD BENCH</strong><span>A benchmark for specification-driven development</span></div><span class="footer-id">${manifest ? `SNAPSHOT ${esc(manifest.resultId)}` : 'NO PUBLIC RESULTS YET'}</span></footer>`
}
export function renderSite(manifest?: ResultManifest): string {
  const body =
    manifest && manifest.runs.length > 0
      ? `<main id="top">${summary(manifest)}${leaderboard(manifest)}${tasks(manifest)}${runs(manifest)}${method()}</main>`
      : empty()
  const title =
    manifest && manifest.runs.length > 0
      ? `Results ${manifest.resultId} — SDD Bench`
      : 'SDD Bench — Results'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="SDD Bench: results of a specification-driven development benchmark."><meta name="theme-color" content="#f7f6f2"><title>${esc(title)}</title><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./site.css"></head><body>${siteHeader(Boolean(manifest && manifest.runs.length > 0))}${body}${siteFooter(manifest)}</body></html>\n`
}
