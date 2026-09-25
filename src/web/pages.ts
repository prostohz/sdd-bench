import { costly, findingLine, findingSummary } from '../judge/explain.js'
import { METRICS, METRIC_LABELS, METRIC_TITLES, type RunRecord } from '../model/run.js'
import { DEFAULT_STAGE, STAGE_TITLES } from '../model/stage.js'
import { toolVersion } from '../model/versions.js'
import type { RunEntry } from '../results.js'
import { runCost, scoreRun } from '../score/score.js'
import { describe, runDirName, type ResultView } from './data.js'

const STYLE = `
/* Палитра и правила — из навыка dataviz, проверены валидатором. */
:root {
  color-scheme: light;
  --surface: #fcfcfb; --plane: #f9f9f7; --wash: rgba(11,11,11,.035);
  --ink: #0b0b0b; --ink-2: #52514e; --ink-muted: #898781;
  --rule: #e1e0d9; --baseline: #c3c2b7; --ring: rgba(11,11,11,.10);
  --good: #006300; --critical: #d03b3b; --serious: #ec835a;
  --series-1: #2a78d6; --track: #e1e0d9;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --surface: #1a1a19; --plane: #0d0d0d; --wash: rgba(255,255,255,.045);
    --ink: #ffffff; --ink-2: #c3c2b7; --ink-muted: #898781;
    --rule: #2c2c2a; --baseline: #383835; --ring: rgba(255,255,255,.10);
    --good: #0ca30c; --critical: #d03b3b; --serious: #ec835a;
    --series-1: #3987e5; --track: #2c2c2a;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface: #1a1a19; --plane: #0d0d0d; --wash: rgba(255,255,255,.045);
  --ink: #ffffff; --ink-2: #c3c2b7; --ink-muted: #898781;
  --rule: #2c2c2a; --baseline: #383835; --ring: rgba(255,255,255,.10);
  --good: #0ca30c; --critical: #d03b3b; --serious: #ec835a;
  --series-1: #3987e5; --track: #2c2c2a;
}

* { box-sizing: border-box }
body { margin: 0 auto; padding: 3rem 1.75rem 5rem; max-width: 68rem;
       background: var(--plane); color: var(--ink);
       font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
       -webkit-font-smoothing: antialiased }

.crumbs { font-size: .82rem; color: var(--ink-muted); margin-bottom: 1.75rem;
          letter-spacing: .01em }
h1 { font-size: 1.5rem; line-height: 1.25; margin: 0; letter-spacing: -.02em; font-weight: 650 }
.lede { color: var(--ink-2); margin: .5rem 0 0; font-size: .92rem; max-width: 52rem }
h2 { font-size: 1rem; margin: 2.5rem 0 .75rem; font-weight: 620; letter-spacing: -.01em }
h3 { font-size: .88rem; margin: 1.5rem 0 .5rem; font-weight: 620; color: var(--ink-2);
     text-transform: uppercase; letter-spacing: .06em }
a { color: inherit; text-decoration: none; border-bottom: 1px solid var(--baseline);
    padding-bottom: 1px }
a:hover { border-bottom-color: currentColor }
/* В таблице подчёркивание каждой ссылки — шум; оно появляется по наведению. */
td a { border-bottom-color: transparent }
tr:hover td a { border-bottom-color: var(--baseline) }
td a:hover { border-bottom-color: currentColor }
.crumbs a { border: 0; text-decoration: underline; text-decoration-color: var(--rule);
            text-underline-offset: 3px }
code { font: .88em/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink-2) }

/* Карточка вместо лестницы из границ: рамка одна, строки разделяет воздух. */
.card { margin-top: 1.5rem; background: var(--surface); border: 1px solid var(--ring);
        border-radius: 10px; overflow: hidden }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums }
th, td { padding: .62rem .85rem; text-align: left; vertical-align: middle }
thead th { font-size: .72rem; font-weight: 600; color: var(--ink-muted);
           text-transform: uppercase; letter-spacing: .07em; padding-bottom: .5rem }
thead tr.groups th { padding: .8rem .85rem .1rem; font-size: .68rem; color: var(--ink-muted) }
thead tr.groups th.grp { border-bottom: 1px solid var(--rule); padding-bottom: .35rem;
                         text-align: center }
thead tr.head th { border-bottom: 1px solid var(--baseline) }
tbody tr + tr td { border-top: 1px solid var(--rule) }
/* Граница между участниками должна читаться сильнее, чем между повторами. */
tbody tr.first-of-group td { border-top: 1px solid var(--ink-muted) }
tbody tr:hover td { background: var(--wash) }
td.num, th.num { text-align: right }
td.who { font-weight: 550; white-space: nowrap }
td.who .rep { font-weight: 400; color: var(--ink-muted) }
td.dim { color: var(--ink-2) }

/* Score — величина. Длина несёт значение, оттенок один. */
td.score { width: 11rem }
.bullet { display: flex; align-items: center; gap: .6rem; justify-content: flex-end }
.bullet .track { flex: 1; height: 4px; background: var(--track); border-radius: 2px;
                 overflow: hidden }
.bullet .track i { display: block; height: 100%; background: var(--series-1); border-radius: 2px }
.bullet .v { font-weight: 620; min-width: 2.6rem; text-align: right }

/* Состояние — статусный цвет и всегда слово рядом. */
.state { display: inline-flex; align-items: center; gap: .4rem; white-space: nowrap }
.state::before { content: ""; width: .45rem; height: .45rem; border-radius: 50%;
                 background: currentColor; flex: none }
.state.good { color: var(--good) } .state.bad { color: var(--critical) }
.state.warn { color: var(--serious) }
tbody .state.good { color: var(--ink-2) }
tbody .state.good::before { background: var(--good) }

.panel { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px;
         padding: 1.1rem 1.25rem; margin-top: 1.5rem }
pre { overflow-x: auto; margin: 0; padding: 1.1rem 1.25rem; background: var(--surface);
      border: 1px solid var(--ring); border-radius: 10px; color: var(--ink-2);
      font: 12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap;
      word-break: break-word }
pre.diff { white-space: pre }
ul.files { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 2.5rem }
ul.files li { margin: .1rem 0; break-inside: avoid;
              font: 12.5px/1.75 ui-monospace, SFMono-Regular, Menlo, monospace }
ul.files a { border-bottom-color: transparent }
ul.files a:hover { border-bottom-color: var(--baseline) }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5rem; align-items: start }

.verdict { margin: 1.1rem 0 }
.verdict + .verdict { border-top: 1px solid var(--rule); padding-top: 1.1rem }
.verdict p { margin: .5rem 0 0 }
.verdict .head { display: flex; align-items: baseline; gap: .6rem; margin: 0 }
.verdict .metric { font-size: 1.05rem; font-weight: 650 }
.verdict .of { color: var(--ink-muted); font-size: .82rem; text-transform: uppercase;
               letter-spacing: .06em }
.verdict ul { margin: .6rem 0 0; padding-left: 1.1rem; color: var(--ink-2); font-size: .89rem }
.verdict li { margin: .2rem 0 }
/* Из чего сложился балл — вторая строка заголовка, не абзац. */
.verdict .tally { color: var(--ink-muted); font-size: .82rem; margin: .3rem 0 0;
                  font-variant-numeric: tabular-nums }
.verdict ul.checks { list-style: none; padding: 0; color: var(--ink-muted);
                     font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace }

.facts { display: flex; flex-wrap: wrap; gap: .5rem 1.4rem; margin: .9rem 0 0;
         color: var(--ink-2); font-size: .9rem }
form.cmp { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap;
           margin-top: 1.25rem; font-size: .87rem; color: var(--ink-2) }
select, button { font: inherit; font-size: .87rem; padding: .35rem .5rem; color: var(--ink);
                 background: var(--surface); border: 1px solid var(--baseline); border-radius: 6px }
button { cursor: pointer; font-weight: 550 }
button:hover { border-color: var(--ink-2) }
`

export function page(title: string, body: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`
}

export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function resultsPage(results: ResultView[]): string {
  if (results.length === 0) {
    return page('sdd-bench', '<h1>sdd-bench</h1><p class="muted">Результатов пока нет.</p>')
  }

  const rows = results
    .map((result) => {
      const participants = [...new Set(result.entries.map((e) => e.record.participantId))].sort()
      const stage = result.manifest.config.stage ?? DEFAULT_STAGE
      return `<tr>
<td class="who"><a href="/r/${esc(result.id)}">${esc(result.id)}</a></td>
<td class="dim">${esc(STAGE_TITLES[stage])}</td>
<td class="dim">${esc(participants.join(', ')) || '—'}</td>
<td class="num dim">${result.entries.length}</td></tr>`
    })
    .join('')

  return page(
    'sdd-bench',
    `<h1>sdd-bench</h1>
<p class="lede">Прогоны инструментов spec-driven development, новые сверху.</p>
<div class="card"><table>
<thead><tr class="head"><th>Результат</th><th>Этап</th><th>Участники</th>
<th class="num">Запусков</th></tr></thead>
<tbody>${rows}</tbody></table></div>`,
  )
}

export function resultPage(result: ResultView): string {
  const config = result.manifest.config
  const rows = result.entries
    .map((entry, index) => {
      const previous = result.entries[index - 1]?.record.participantId
      return runRow(result, entry, previous !== entry.record.participantId)
    })
    .join('')

  const options = result.entries
    .map((entry) => `<option value="${esc(runDirName(entry))}">${esc(describe(entry.record))}</option>`)
    .join('')

  return page(
    result.id,
    `<div class="crumbs"><a href="/">все результаты</a></div>
<h1>${esc(result.id)}</h1>
<p class="lede">${esc(STAGE_TITLES[config.stage ?? DEFAULT_STAGE])} ·
провайдер <code>${esc(config.provider)}</code> ·
участники <code>${esc(config.participantModel)}</code> (effort ${esc(config.participantEffort)}) ·
судья <code>${esc(config.judgeModel)}</code> · повторов ${config.repeats}</p>

<div class="card"><table>
<thead>
<tr class="groups"><th colspan="3"></th><th colspan="3" class="grp num">Оценки судей</th>
<th></th><th></th><th colspan="2" class="grp num">Эффективность</th></tr>
<tr class="head"><th>Запуск</th><th>Версия инструмента</th><th>Статус</th>
${METRICS.map((m) => `<th class="num" title="${esc(METRIC_TITLES[m])}">${esc(METRIC_LABELS[m])}</th>`).join('')}
<th class="num">Score</th><th class="num">Скрытые тесты</th>
<th class="num">Время</th><th class="num">$</th></tr>
</thead><tbody>${rows}</tbody></table></div>

<form class="cmp" action="/cmp" method="get">
<input type="hidden" name="r" value="${esc(result.id)}">
<label>Сравнить <select name="a">${options}</select></label>
<label>с <select name="b">${options}</select></label>
<button type="submit">Показать</button></form>`,
  )
}

function runRow(result: ResultView, entry: RunEntry, firstOfGroup: boolean): string {
  const record = entry.record
  const score = scoreRun(record, result.manifest.runs, result.manifest.config.participantPricing)
  const price = runCost(record, result.manifest.config.participantPricing)
  const href = `/r/${esc(result.id)}/${esc(runDirName(entry))}`

  // Оценки судей остаются чернилами: они лежат в узкой полосе, и оттенок
  // показывал бы разброс, которого нет.
  const metrics = METRICS.map((metric) => {
    const verdict = record.verdicts[metric]
    return `<td class="num dim">${verdict === undefined ? '—' : verdict.score.toFixed(1)}</td>`
  }).join('')

  const telemetry = record.telemetry
  return `<tr${firstOfGroup ? ' class="first-of-group"' : ''}>
<td class="who"><a href="${href}">${esc(record.participantId)}</a>
<span class="rep">повтор ${record.repeat}</span></td>
<td class="dim"><code>${esc(toolVersion(record) ?? '—')}</code></td>
<td>${state(record.status)}</td>
${metrics}
<td class="score">${gauge(score.value)}</td>
<td class="num">${hiddenCell(record)}</td>
<td class="num dim">${telemetry ? minutes(telemetry.activeMs ?? telemetry.durationMs) : '—'}</td>
<td class="num dim">${price.value === null ? '—' : `${price.estimated ? '≈' : ''}${price.value.toFixed(3)}`}</td>
</tr>`
}

/** Величина читается длиной, а не оттенком: один тон, шкала от нуля до ста. */
function gauge(value: number | null): string {
  if (value === null) return '<div class="bullet"><span class="v">—</span></div>'
  return `<div class="bullet"><span class="track"><i style="width:${value.toFixed(1)}%"></i></span>
<span class="v">${value.toFixed(1)}</span></div>`
}

/** Цвет состояния всегда идёт со словом — сам по себе он ничего не значит. */
function state(status: string): string {
  const kind = status === 'ok' ? 'good' : status === 'timeout' ? 'warn' : 'bad'
  return `<span class="state ${kind}">${esc(status)}</span>`
}

function hiddenCell(record: RunRecord): string {
  if (record.hidden === undefined) return '—'
  const percent = Math.round(record.hidden.passRatio * 100)
  const kind = record.hidden.passRatio === 1 ? 'good' : 'bad'
  return `<span class="state ${kind}">${percent}%</span>`
}

export interface RunPageData {
  result: ResultView
  entry: RunEntry
  spec: string[]
  impl: string[]
}

export function runPage(data: RunPageData): string {
  const { result, entry } = data
  const base = `/r/${esc(result.id)}/${esc(runDirName(entry))}`

  return page(
    `${describe(entry.record)} — ${result.id}`,
    `<div class="crumbs"><a href="/">все результаты</a> ·
<a href="/r/${esc(result.id)}">${esc(result.id)}</a></div>
<h1>${esc(describe(entry.record))}</h1>
${statusLine(entry.record, result)}
${verdictsSection(entry.record)}
<h2>Спецификация</h2>${fileList(data.spec, `${base}/spec`)}
<h2>Реализация</h2>
<p class="lede"><a href="${base}/diff">весь diff одним куском</a> — только то, что написал
участник, без установленного инструментария.</p>
${fileList(data.impl, `${base}/impl`)}`,
  )
}

function statusLine(record: RunRecord, result: ResultView): string {
  const score = scoreRun(record, result.manifest.runs, result.manifest.config.participantPricing)
  const price = runCost(record, result.manifest.config.participantPricing)
  const telemetry = record.telemetry
  const version = toolVersion(record)
  const parts = [
    state(record.status),
    `Score <b>${score.value === null ? '—' : score.value.toFixed(1)}</b>`,
  ]
  if (version) parts.push(`версия инструмента <code>${esc(version)}</code>`)
  if (record.hidden) parts.push(`скрытые тесты ${hiddenCell(record)}`)
  if (telemetry) {
    parts.push(`${minutes(telemetry.activeMs ?? telemetry.durationMs)}`)
    parts.push(`${telemetry.totalTokens.toLocaleString('ru-RU')} токенов`)
    if (price.value !== null) parts.push(`${price.estimated ? '≈' : ''}$${price.value.toFixed(3)}`)
  }
  if (score.zeroReason) parts.push(`<span class="state bad">${esc(score.zeroReason)}</span>`)
  return `<div class="facts">${parts.map((part) => `<span>${part}</span>`).join('')}</div>`
}

export function verdictsSection(record: RunRecord): string {
  const verdicts = METRICS.map((metric) => record.verdicts[metric]).filter((v) => v !== undefined)
  if (verdicts.length === 0) {
    return '<h2>Оценки судей</h2><div class="panel"><p class="lede">Запуск не оценён.</p></div>'
  }

  const blocks = verdicts
    .map((verdict) => {
      const summary = findingSummary(verdict.metric, verdict.findings)
      // Findings that cost nothing are most of the list and explain no part of
      // the score; what is shown is what the number is made of.
      const lost = verdict.findings.filter(costly)
      return `<div class="verdict">
<p class="head"><span class="metric">${esc(METRIC_LABELS[verdict.metric])} ${verdict.score.toFixed(2)}</span>
<span class="of">${esc(METRIC_TITLES[verdict.metric])}</span></p>
${summary ? `<p class="tally">${esc(summary)}</p>` : ''}
<p>${esc(verdict.rationale)}</p>
${
  lost.length === 0
    ? ''
    : `<ul>${lost.map((f) => `<li><b>${esc(f.ruling)}</b> ${esc(findingLine(f).slice(f.ruling.length + 2))}</li>`).join('')}</ul>`
}
${
  verdict.evidence.length === 0
    ? ''
    : `<ul class="checks">${verdict.evidence.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
}</div>`
    })
    .join('')

  return `<h2>Оценки судей</h2><div class="panel">${blocks}</div>`
}

export function comparePage(result: ResultView, left: RunPageData, right: RunPageData): string {
  const column = (data: RunPageData): string => {
    const base = `/r/${esc(result.id)}/${esc(runDirName(data.entry))}`
    return `<div>
<h2><a href="${base}">${esc(describe(data.entry.record))}</a></h2>
${statusLine(data.entry.record, result)}
${verdictsSection(data.entry.record)}
<h3>Спецификация</h3>${fileList(data.spec, `${base}/spec`)}
<h3>Реализация</h3><p class="lede"><a href="${base}/diff">весь diff</a></p>
${fileList(data.impl, `${base}/impl`)}</div>`
  }

  return page(
    `сравнение — ${result.id}`,
    `<div class="crumbs"><a href="/">все результаты</a> ·
<a href="/r/${esc(result.id)}">${esc(result.id)}</a></div>
<h1>Сравнение</h1>
<div class="cols">${column(left)}${column(right)}</div>`,
  )
}

export function filePage(title: string, backHref: string, backLabel: string, body: string, diff = false): string {
  return page(
    title,
    `<div class="crumbs"><a href="${backHref}">← ${esc(backLabel)}</a></div>
<h1>${esc(title)}</h1><pre class="${diff ? 'diff' : ''}">${esc(body)}</pre>`,
  )
}

function fileList(files: string[], base: string): string {
  if (files.length === 0) return '<div class="panel"><p class="lede">Файлов нет.</p></div>'
  return `<div class="panel"><ul class="files">${files
    .map((file) => `<li><a href="${base}?path=${encodeURIComponent(file)}">${esc(file)}</a></li>`)
    .join('')}</ul></div>`
}

function minutes(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}м ${String(total % 60).padStart(2, '0')}с`
}
