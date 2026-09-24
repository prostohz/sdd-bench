import { METRICS, METRIC_LABELS, type ResultManifest, type RunRecord } from '../model/run.js'
import { DEFAULT_STAGE, STAGE_TITLES } from '../model/stage.js'
import { TASK_CLASSES, type TaskClass } from '../model/task.js'
import { scoreParticipants, scoreRun, type ParticipantScore } from '../score/score.js'

const CLASS_TITLES: Record<TaskClass, string> = {
  greenfield: 'Greenfield',
  'brownfield-nospec': 'Brownfield без спецификации',
  'brownfield-spec': 'Brownfield со спецификацией',
}

export function renderReport(manifest: ResultManifest): string {
  const participants = scoreParticipants(manifest.runs)
  const lines: string[] = []

  lines.push(`# Результат ${manifest.resultId}`, '')
  lines.push(
    `Участники: \`${manifest.config.participantProvider ?? 'claude'}\` / \`${manifest.config.participantModel}\` (effort \`${manifest.config.participantEffort}\`). ` +
      `Судья: \`${manifest.config.judgeProvider ?? 'claude'}\` / \`${manifest.config.judgeModel}\` (effort \`${manifest.config.judgeEffort}\`). ` +
      `Повторов: ${manifest.config.repeats}. ` +
      `Этап: ${STAGE_TITLES[manifest.config.stage ?? DEFAULT_STAGE]}.`,
    '',
  )

  lines.push('## Итог', '', ...totalTable(participants, manifest.runs), '')
  lines.push('## Задачи', '', ...taskTable(participants), '')
  lines.push('## Эффективность', '', ...efficiencyTable(participants), '')
  lines.push('## Запуски', '', ...runTable(manifest.runs), '')

  return lines.join('\n')
}

function totalTable(participants: ParticipantScore[], runs: RunRecord[]): string[] {
  const classes = TASK_CLASSES.filter((c) => runs.some((r) => r.taskClass === c))
  const header = ['Участник', ...classes.map((c) => CLASS_TITLES[c]), 'Итог']
  const rows = [...participants]
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .map((p) => [
      p.participantId,
      ...classes.map((c) => number(p.classes.find((x) => x.key === c)?.score ?? null)),
      number(p.score),
    ])
  return table(header, rows)
}

function taskTable(participants: ParticipantScore[]): string[] {
  const taskIds = [...new Set(participants.flatMap((p) => p.tasks.map((t) => t.key)))].sort()
  const header = ['Участник', ...taskIds]
  const rows = participants.map((p) => [
    p.participantId,
    ...taskIds.map((id) => number(p.tasks.find((t) => t.key === id)?.score ?? null)),
  ])
  return table(header, rows)
}

function efficiencyTable(participants: ParticipantScore[]): string[] {
  const header = ['Участник', 'Запусков', 'Среднее время', 'Средние токены', 'Средняя стоимость']
  const rows = participants.map((p) => [
    p.participantId,
    String(p.efficiency.runs),
    duration(p.efficiency.meanDurationMs),
    p.efficiency.meanTotalTokens === null ? '—' : Math.round(p.efficiency.meanTotalTokens).toLocaleString('ru-RU'),
    p.efficiency.meanCostUsd === null ? '—' : `$${p.efficiency.meanCostUsd.toFixed(2)}`,
  ])
  return table(header, rows)
}

function runTable(runs: RunRecord[]): string[] {
  const header = ['Запуск', 'Статус', ...METRICS.map((m) => METRIC_LABELS[m]), 'Score', 'Примечание']
  const rows = runs.map((run) => {
    const score = scoreRun(run)
    return [
      `${run.taskId} / ${run.participantId} / ${run.repeat}`,
      run.status,
      ...METRICS.map((m) => {
        const verdict = run.verdicts[m]
        return verdict === undefined ? '—' : verdict.score.toFixed(1)
      }),
      number(score.value),
      score.zeroReason ?? run.statusDetail ?? '',
    ]
  })
  return table(header, rows)
}

function table(header: string[], rows: string[][]): string[] {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ]
}

function number(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function duration(ms: number | null): string {
  if (ms === null) return '—'
  const totalSeconds = Math.round(ms / 1000)
  return `${Math.floor(totalSeconds / 60)}м ${String(totalSeconds % 60).padStart(2, '0')}с`
}
