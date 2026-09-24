import { METRICS, METRIC_TITLES, type ResultManifest, type RunRecord } from '../model/run.js'
import { DEFAULT_STAGE, STAGE_METRICS, STAGE_TITLES } from '../model/stage.js'
import { scoreParticipants, scoreRun } from '../score/score.js'
const NAMES: Record<string, string> = {
  neutral: 'Neutral SDD',
  openspec: 'OpenSpec',
  speckit: 'Spec Kit',
  canon: 'Canon',
  bmad: 'BMad Method',
}
const CLASS_NAMES: Record<string, string> = {
  greenfield: 'Greenfield',
  'brownfield-nospec': 'Brownfield · без спецификации',
  'brownfield-spec': 'Brownfield · со спецификацией',
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
    : new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(parsed)
}
function duration(ms: number | null): string {
  return ms === null ? '—' : `${Math.round(ms / 60000)} мин`
}
function sectionHead(index: string, title: string, note: string): string {
  return `<div class="section-head"><span class="section-index">${index}</span><div><h2>${title}</h2><p>${note}</p></div></div>`
}
export function siteHeader(hasResults: boolean, current: 'home' | 'methodology' = 'home'): string {
  const home = current === 'home'
  return `<header class="topbar"><a class="brand" href="./index.html" aria-label="SDD Bench — главная"><span class="brand-mark">S<span>/</span>D</span><span>SDD BENCH</span></a><nav aria-label="Разделы"><a href="${home ? '#results' : './index.html#results'}">Результаты</a>${hasResults ? `<a href="${home ? '#tasks' : './index.html#tasks'}">Задачи</a>` : ''}<a href="${home ? './methodology.html' : '#top'}"${home ? '' : ' aria-current="page"'}>Методология</a></nav><span class="topbar-badge">OPEN BENCHMARK <span class="live-dot"></span></span></header>`
}
function empty(): string {
  return `<main id="top"><section class="hero empty-hero"><div class="hero-kicker"><span class="kicker-line"></span> SPEC-DRIVEN DEVELOPMENT / BENCHMARK</div><div class="hero-layout"><div><h1>От намерения<br>к работающему<br><em>коду.</em></h1><p class="hero-intro">Сравниваем инструменты разработки через спецификацию: качество требований, точность реализации и стоимость пути между ними.</p><a class="hero-link" href="./methodology.html">Как устроен бенчмарк <span aria-hidden="true">↗</span></a></div><div class="hero-art" aria-hidden="true"><div class="art-caption">BENCHMARK PIPELINE <span>01 / 03</span></div><div class="art-step"><span>01</span><strong>Намерение</strong><i></i></div><div class="art-step"><span>02</span><strong>Спецификация</strong><i></i></div><div class="art-step"><span>03</span><strong>Реализация</strong><i></i></div><div class="art-bottom">INTENT <span>→</span> SPEC <span>→</span> CODE</div></div></div></section><section id="results" class="content empty-state"><div class="section-head"><span class="section-index">01</span><div><h2>Результаты</h2><p>Публичных прогонов пока нет.</p></div></div><div class="empty-panel"><div class="empty-icon">∅</div><div><h3>Первый результат готовится</h3><p>После завершения и проверки прогона здесь появятся оценки участников, сравнение задач и таблица запусков.</p></div><span class="empty-label">AWAITING DATA</span></div></section>${method('02')}</main>`
}
function summary(manifest: ResultManifest): string {
  const participants = scoreParticipants(manifest.runs)
  const scored = manifest.runs.filter((run) => scoreRun(run).value !== null).length
  const taskCount = new Set(manifest.runs.map((run) => run.taskId)).size
  const stage = manifest.config.stage ?? DEFAULT_STAGE
  return `<section class="hero results-hero"><div class="hero-kicker"><span class="kicker-line"></span> SPEC-DRIVEN DEVELOPMENT / BENCHMARK</div><div class="results-hero-grid"><div><div class="edition">РЕЗУЛЬТАТ ПРОГОНА <span>${esc(manifest.resultId)}</span></div><h1>От спецификации<br>к <em>результату.</em></h1><p class="hero-intro">Сравнение SDD-процессов на одинаковых задачах, модели и условиях. Все баллы рассчитаны по сохранённым решениям судей.</p><div class="hero-meta"><span>${date(manifest.createdAt)}</span><span>${esc(STAGE_TITLES[stage])}</span><span>${esc(manifest.config.participantModel)}</span><span>Повторов: ${manifest.config.repeats}</span></div></div><div class="hero-stat"><span class="hero-stat-label">НАБОР ДАННЫХ / 01</span><strong>${participants.length.toString().padStart(2, '0')}</strong><span>участников</span><div class="stat-rule"></div><div class="hero-stat-secondary"><div><b>${taskCount.toString().padStart(2, '0')}</b><span>задачи</span></div><div><b>${scored}<small>/${manifest.runs.length}</small></b><span>оценено запусков</span></div></div></div></div></section>`
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
  return `<section class="content" id="results">${sectionHead('01', 'Рейтинг прогона', 'Среднее по представленным классам задач. Время и стоимость показаны отдельно от балла.')}<div class="table-shell"><table class="leaderboard"><thead><tr><th scope="col">#</th><th scope="col">Участник</th><th scope="col">Итог</th>${classes.map((key) => `<th scope="col">${esc(CLASS_NAMES[key] ?? key)}</th>`).join('')}<th scope="col">Ср. время</th><th scope="col">Ср. стоимость</th></tr></thead><tbody>${rows}</tbody></table></div><p class="table-footnote">Баллы от 0 до 100 · «—» означает, что данных нет.</p></section>`
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
      return `<article class="task-card"><div class="task-top"><span>ЗАДАЧА ${String(index + 1).padStart(2, '0')}</span><span>${esc(CLASS_NAMES[taskClass] ?? taskClass)}</span></div><h3>${esc(taskId)}</h3><p>Средний балл по повторам</p><div class="task-bars">${rows}</div></article>`
    })
    .join('')
  return `<section class="content task-section" id="tasks">${sectionHead('02', 'Разрез по задачам', 'Каждая карточка показывает средний балл участника по повторам одной задачи.')}<div class="task-grid">${cards}</div></section>`
}
function runStatus(run: RunRecord): string {
  const scored = scoreRun(run)
  if (scored.value === null) return '<span class="status pending">Ожидает оценки</span>'
  if (scored.zeroReason) return '<span class="status failed">Нулевой балл</span>'
  return '<span class="status complete">Оценён</span>'
}
function runs(manifest: ResultManifest): string {
  const stage = manifest.config.stage ?? DEFAULT_STAGE
  const metrics = STAGE_METRICS[stage]
  const showHidden = stage === 'full'
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
      return `<tr><td><strong>${esc(NAMES[run.participantId] ?? run.participantId)}</strong><span class="run-sub">${esc(run.taskId)} · повтор ${run.repeat}</span></td>${cells}<td class="number run-score">${score(value.value)}</td>${hiddenCell}<td>${runStatus(run)}</td></tr>`
    })
    .join('')
  return `<section class="content runs-section" id="runs">${sectionHead('03', 'Все запуски', 'Оценки судей по шкале 0–10. Скрытые тесты показаны отдельно от итогового балла.')}<div class="table-shell"><table class="runs-table"><thead><tr><th scope="col">Запуск</th>${metrics.map((metric) => `<th scope="col" title="${esc(METRIC_TITLES[metric])}">${esc(metric)}</th>`).join('')}<th scope="col">Score</th>${showHidden ? '<th scope="col">Скрытые тесты</th>' : ''}<th scope="col">Статус</th></tr></thead><tbody>${rows}</tbody></table></div></section>`
}
function method(index = '04'): string {
  return `<section class="method" id="method"><div class="content">${sectionHead(index, 'Как читать результат', 'Коротко о методе расчёта и границах сравнения.')}<div class="method-grid"><div class="method-item"><span>01 / ОДИНАКОВЫЕ УСЛОВИЯ</span><h3>Один вход для всех</h3><p>Участники получают одинаковую задачу, модель и лимиты. Отличается только SDD-процесс и его инструментарий.</p></div><div class="method-item"><span>02 / ПОПУНКТНАЯ ОЦЕНКА</span><h3>Решения, затем балл</h3><p>Судья оценивает отдельные требования и дефекты. Балл вычисляется по этим решениям, а не выбирается моделью целиком.</p></div><div class="method-item"><span>03 / АГРЕГАЦИЯ</span><h3>Равный вес классов</h3><p>Балл запуска — среднее геометрическое применимых метрик. Повторы усредняются в задачу, задачи — в класс, классы — в итог.</p></div></div><div class="method-note"><span>МЕТОДОЛОГИЯ</span><p>Ошибка, таймаут или регрессия исходных тестов дают запуску 0. Время и скрытые тесты не входят в итоговый балл. Этап «только спецификация» не включает метрику реализации.</p></div><a class="method-link" href="./methodology.html">Полная методология <span aria-hidden="true">↗</span></a></div></section>`
}
export function siteFooter(manifest?: ResultManifest): string {
  return `<footer class="footer"><span class="brand-mark">S<span>/</span>D</span><div><strong>SDD BENCH</strong><span>Бенчмарк инструментов разработки через спецификацию</span></div><span class="footer-id">${manifest ? `СНИМОК ${esc(manifest.resultId)}` : 'ПУБЛИЧНЫХ РЕЗУЛЬТАТОВ ПОКА НЕТ'}</span></footer>`
}
export function renderSite(manifest?: ResultManifest): string {
  const body =
    manifest && manifest.runs.length > 0
      ? `<main id="top">${summary(manifest)}${leaderboard(manifest)}${tasks(manifest)}${runs(manifest)}${method()}</main>`
      : empty()
  const title =
    manifest && manifest.runs.length > 0
      ? `Результаты ${manifest.resultId} — SDD Bench`
      : 'SDD Bench — результаты'
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="SDD Bench: результаты сравнения инструментов разработки через спецификацию."><meta name="theme-color" content="#f7f6f2"><title>${esc(title)}</title><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./site.css"></head><body>${siteHeader(Boolean(manifest && manifest.runs.length > 0))}${body}${siteFooter(manifest)}</body></html>\n`
}
