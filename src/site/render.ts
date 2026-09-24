import type { Metric, ResultManifest } from '../model/run.js'
import { DEFAULT_STAGE, STAGE_METRICS } from '../model/stage.js'
import { scoreParticipants, scoreRun } from '../score/score.js'
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
function sectionHead(title: string, note?: string): string {
  return `<div class="section-head"><h2>${title}</h2>${note ? `<p>${note}</p>` : ''}</div>`
}
export function siteHeader(current: 'home' | 'methodology' = 'home'): string {
  const home = current === 'home'
  return `<header class="topbar"><a class="brand" href="./index.html">SDD BENCH</a><nav aria-label="Sections"><a href="./index.html"${home ? ' aria-current="page"' : ''}>Scores</a><a href="./methodology.html"${home ? '' : ' aria-current="page"'}>Methodology</a></nav></header>`
}
function empty(): string {
  return `<main id="top"><section class="hero empty-hero"><div class="hero-layout"><div><h1>From intent<br>to working<br><em>code.</em></h1><p class="hero-intro">Comparing specification-driven workflows by specification quality, implementation fidelity, and effort.</p><a class="hero-link" href="./methodology.html">How the benchmark works <span aria-hidden="true">↗</span></a></div><div class="hero-art" aria-hidden="true"><div class="art-caption">BENCHMARK PIPELINE <span>01 / 03</span></div><div class="art-step"><span>01</span><strong>Intent</strong><i></i></div><div class="art-step"><span>02</span><strong>Specification</strong><i></i></div><div class="art-step"><span>03</span><strong>Implementation</strong><i></i></div><div class="art-bottom">INTENT <span>→</span> SPEC <span>→</span> CODE</div></div></div></section><section id="results" class="content empty-state">${sectionHead('Results', 'No public runs yet.')}<div class="empty-panel"><div class="empty-icon">∅</div><div><h3>The first result is in progress</h3><p>Once a run is complete and reviewed, participant scores and task comparisons will appear here.</p></div><span class="empty-label">AWAITING DATA</span></div></section>${method()}</main>`
}
function summary(version: string): string {
  return `<section class="hero results-hero"><div class="results-hero-content"><div class="edition">VERSION <span>${esc(version)}</span></div><h1>From specification to <em>results.</em></h1><p class="hero-intro">SDD workflows compared on the same tasks, model, and settings.</p></div></section>`
}
function leaderboard(manifest: ResultManifest): string {
  const ranked = scoreParticipants(manifest.runs).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const classes = [...new Set(manifest.runs.map((run) => run.taskClass))].sort()
  const rows = ranked
    .map((participant) => {
      const classCells = classes
        .map((key) => {
          const value = participant.classes.find((item) => item.key === key)?.score ?? null
          return `<td class="class-cell"><span>${score(value)}</span>${bar(value)}</td>`
        })
        .join('')
      return `<tr><th scope="row"><span class="participant-name">${esc(NAMES[participant.participantId] ?? participant.participantId)}</span></th><td class="total-cell"><strong>${score(participant.score)}</strong><span>/ 100</span></td>${classCells}</tr>`
    })
    .join('')
  return `<section class="content" id="results">${sectionHead('Overall scores', 'Mean across included task classes.')}<div class="table-shell"><table class="leaderboard"><thead><tr><th scope="col">Participant</th><th scope="col">Score</th>${classes.map((key) => `<th scope="col">${esc(CLASS_NAMES[key] ?? key)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`
}
function tasks(manifest: ResultManifest): string {
  const participants = scoreParticipants(manifest.runs).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const taskIds = [...new Set(manifest.runs.map((run) => run.taskId))].sort()
  const cards = taskIds
    .map((taskId) => {
      const taskClass = manifest.runs.find((run) => run.taskId === taskId)?.taskClass ?? ''
      const rows = participants
        .map((participant) => {
          const task = participant.tasks.find((item) => item.key === taskId)
          const value = task?.score ?? null
          return `<div class="task-row"><span>${esc(NAMES[participant.participantId] ?? participant.participantId)}</span>${bar(value)}<strong>${score(value)}</strong></div>`
        })
        .join('')
      return `<article class="task-card"><div class="task-top">${esc(CLASS_NAMES[taskClass] ?? taskClass)}</div><h3>${esc(taskId)}</h3><p>Mean score across repeats</p><div class="task-bars">${rows}</div></article>`
    })
    .join('')
  return `<section class="content task-section" id="tasks">${sectionHead('Task breakdown', 'Each card shows a participant’s mean score across repeats for one task.')}<div class="task-grid">${cards}</div></section>`
}
function runs(manifest: ResultManifest): string {
  const stage = manifest.config.stage ?? DEFAULT_STAGE
  const metrics = STAGE_METRICS[stage]
  const showHidden = stage === 'full'
  const note = showHidden ? 'Held-out tests are reported separately from the score.' : undefined
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
      return `<tr><td><strong>${esc(NAMES[run.participantId] ?? run.participantId)}</strong><span class="run-sub">${esc(run.taskId)} · repeat ${run.repeat}</span></td>${cells}<td class="number run-score">${score(value.value)}</td>${hiddenCell}</tr>`
    })
    .join('')
  return `<section class="content runs-section" id="runs">${sectionHead('Run scores', note)}<div class="table-shell"><table class="runs-table"><thead><tr><th scope="col">Run</th>${metrics.map((metric) => `<th scope="col" class="number" title="${esc(METRIC_LABELS[metric])}">${esc(metric)}</th>`).join('')}<th scope="col" class="number">Score</th>${showHidden ? '<th scope="col" class="number">Held-out tests</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div></section>`
}
function method(): string {
  return `<section class="method" id="method"><div class="content">${sectionHead('How to read this result', 'How scores are calculated and where comparisons apply.')}<div class="method-grid"><div class="method-item"><h3>One starting point</h3><p>Participants receive the same task, model, and limits. Only the SDD workflow and its tools differ.</p></div><div class="method-item"><h3>Decisions before scores</h3><p>Judges assess individual requirements and defects. The harness calculates scores from those decisions.</p></div><div class="method-item"><h3>Equal class weights</h3><p>A run score is the geometric mean of applicable metrics. Repeats average into tasks, tasks into classes, and classes into the final score.</p></div></div></div></section>`
}
export function renderSite(manifest: ResultManifest | undefined, version: string): string {
  const body =
    manifest && manifest.runs.length > 0
      ? `<main id="top">${summary(version)}${leaderboard(manifest)}${tasks(manifest)}${runs(manifest)}${method()}</main>`
      : empty()
  const title = 'Scores — SDD Bench'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="SDD Bench: results of a specification-driven development benchmark."><meta name="theme-color" content="#f7f6f2"><title>${esc(title)}</title><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./site.css"></head><body>${siteHeader()}${body}</body></html>\n`
}
