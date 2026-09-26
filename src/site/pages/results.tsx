import type { ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js'
import type { Metric, ResultManifest } from '../../model/run.js'
import { DEFAULT_STAGE, STAGE_METRICS } from '../../model/stage.js'
import { participantVersions } from '../../model/versions.js'
import {
  runCost,
  scoreParticipants,
  scoreRun,
  type ParticipantScore,
} from '../../score/score.js'

const METRIC_LABELS: Record<Metric, string> = {
  'spec-quality': 'Specification quality',
  'spec-fit': 'Specification fit to requirements',
  'impl-fit': 'Implementation fit to specification',
}
const NAMES: Record<string, string> = {
  neutral: 'Baseline',
  openspec: 'OpenSpec',
  gsd: 'GSD Core',
  speckit: 'Spec Kit',
  bmad: 'BMad Method',
  canon: 'Canon',
}
const REPOSITORIES: Record<string, string> = {
  openspec: 'https://github.com/Fission-AI/OpenSpec',
  gsd: 'https://github.com/open-gsd/gsd-core',
  speckit: 'https://github.com/github/spec-kit',
  bmad: 'https://github.com/bmad-code-org/BMAD-METHOD',
  canon: 'https://github.com/prostohz/canon',
}
const CLASS_NAMES: Record<string, string> = {
  greenfield: 'Greenfield',
  'brownfield-nospec': 'Brownfield · no specification',
  'brownfield-spec': 'Brownfield · current specification',
}
const TASK_DESCRIPTIONS: Record<string, string> = {
  'ledger-cli': 'Build a standalone CLI to record income and expenses, list transactions, and calculate balances.',
  'tasks-cli': 'Add priorities, sorting, and filtering to an existing task CLI while preserving saved tasks and existing behavior.',
}

const sectionClass = 'mx-auto w-[var(--page-width)] scroll-mt-[30px] pt-[74px] max-[760px]:pt-[60px]'
const numberClass = 'text-right font-mono whitespace-nowrap'
const tableClass = 'min-w-[760px] w-full border-collapse text-left tabular-nums [&_th]:border-b [&_th]:border-line [&_th]:px-5 [&_th]:py-[18px] [&_td]:border-b [&_td]:border-line [&_td]:px-5 [&_td]:py-[18px] [&_thead]:bg-[#edf1e9] [&_thead_th]:whitespace-nowrap [&_thead_th]:font-mono [&_thead_th]:text-[10px] [&_thead_th]:leading-[normal] [&_thead_th]:font-medium [&_thead_th]:tracking-[0.08em] [&_thead_th]:text-[#5a6b5d] [&_thead_th]:uppercase [&_tbody_tr:hover]:bg-[#f9fbf7] [&_tbody_tr:last-child>*]:border-b-0'
const runTableClass = `${tableClass} [&_th]:px-[19px] [&_th]:py-[15px] [&_td]:px-[19px] [&_td]:py-[15px] [&_td]:text-[13px]`

function score(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function duration(value: number | undefined): string {
  return value === undefined ? '—' : `${(value / 60_000).toFixed(1)} min`
}

function cost(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(3)}`
}

function Bar({ value }: { value: number | null }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <span className="block h-[5px] w-full overflow-hidden bg-[#e8ede5]" aria-hidden="true">
      <span className="block h-full bg-green-2" style={{ width: `${width}%` }} />
    </span>
  )
}

function SectionHead({
  title,
  note,
}: {
  title: string
  note?: string | undefined
}) {
  return (
    <div className="mb-[34px]">
      <h2 className="mb-[9px] font-serif text-[clamp(29px,3vw,43px)] leading-[1.2] font-extrabold tracking-[-0.055em] max-[760px]:text-[30px]">{title}</h2>
      {note && <p className="m-0 text-sm leading-[1.5] text-muted">{note}</p>}
    </div>
  )
}

function ParticipantName({ id }: { id: string }): ReactNode {
  const name = NAMES[id] ?? id
  const repository = REPOSITORIES[id]
  return repository ? (
    <a
      className="hover:text-green-2 hover:underline hover:underline-offset-[3px]"
      href={repository}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} on GitHub (opens in a new tab)`}
    >
      {name}
    </a>
  ) : (
    name
  )
}

function baselinePriority(a: string, b: string): number {
  return Number(b === 'neutral') - Number(a === 'neutral')
}

function compareParticipants(a: ParticipantScore, b: ParticipantScore): number {
  return (
    baselinePriority(a.participantId, b.participantId) ||
    (b.score ?? -1) - (a.score ?? -1) ||
    a.participantId.localeCompare(b.participantId)
  )
}

function EmptyResults() {
  return (
    <section id="results" className={`${sectionClass} pb-3`}>
      <SectionHead title="Results" note="No data yet." />
    </section>
  )
}

function Summary({ version }: { version: string }) {
  return (
    <section className="border-b border-line bg-[radial-gradient(circle_at_88%_16%,#f0f4e6_0,transparent_32%),var(--bg)] px-[var(--page-inset)] pt-7 pb-8 max-[760px]:pt-6 max-[760px]:pb-7">
      <div className="mx-auto max-w-[var(--page-max)]">
        <div className="mb-3.5 inline-flex items-center gap-2.5 rounded bg-green px-[11px] py-2 font-mono text-[11px] leading-[normal] font-medium tracking-[0.08em] text-white">
          VERSION <span className="text-xs leading-[normal] tracking-normal text-lime">{version}</span>
        </div>
        <h1 className="m-0 font-serif text-[clamp(44px,4.5vw,68px)] leading-[1.07] font-extrabold tracking-[-0.075em] max-[1050px]:text-[clamp(42px,4.5vw,58px)] max-[760px]:text-[clamp(34px,7vw,44px)] max-[430px]:text-[34px]">
          From specification to <em className="not-italic text-green-2">results.</em>
        </h1>
        <p className="mt-3 max-w-[900px] text-base leading-[1.55] text-[#57675c] max-[760px]:text-[15px]">
          SDD workflows compared on the same tasks and model. Run limits are noted below.
        </p>
      </div>
    </section>
  )
}

function Leaderboard({ manifest }: { manifest: ResultManifest }) {
  const ranked = scoreParticipants(
    manifest.runs,
    manifest.config.participantPricing,
  ).sort(compareParticipants)
  const classes = [...new Set(manifest.runs.map((run) => run.taskClass))].sort()
  return (
    <section className={sectionClass} id="results">
      <SectionHead
        title="Overall scores"
        note="Baseline first; methods ranked by score across included task classes."
      />
      <div className="overflow-x-auto border border-line bg-paper">
        <Table className={tableClass}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Participant</TableHead>
              <TableHead scope="col">Score</TableHead>
              {classes.map((key) => (
                <TableHead scope="col" key={key}>
                  {CLASS_NAMES[key] ?? key}
                </TableHead>
              ))}
              <TableHead scope="col" className={numberClass}>
                Avg. time
              </TableHead>
              <TableHead scope="col" className={numberClass}>
                Avg. cost
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((participant) => {
              const versions = participantVersions(
                manifest.runs,
                participant.participantId,
              )
              return (
                <TableRow
                  key={participant.participantId}
                  className={
                    participant.participantId === 'neutral'
                      ? 'bg-[#f2f3ef] hover:bg-[#ebeee8] [&>*]:border-b-2 [&>*]:border-[#d4dbd1]'
                      : 'hover:bg-[#f9fbf7]'
                  }
                >
                  <th scope="row" className="font-medium">
                    <span className="block whitespace-nowrap font-serif text-base leading-[normal] font-bold tracking-[-0.025em]">
                      <ParticipantName id={participant.participantId} />
                    </span>
                    {participant.participantId === 'neutral' ? (
                      <span className="mt-1 block font-mono text-[9px] leading-[1.4] text-[#8c978e]">
                        Naive model planning
                      </span>
                    ) : versions.length > 0 ? (
                      <span className="mt-1 block font-mono text-[11px] leading-[normal] text-muted">
                        Tool version: {versions.join(', ')}
                      </span>
                    ) : null}
                  </th>
                  <TableCell className="whitespace-nowrap">
                    <strong className="font-serif text-[28px] leading-[normal] font-extrabold tracking-[-0.06em] text-green">{score(participant.score)}</strong>
                    <span className="ml-[3px] font-mono text-[11px] leading-[normal] text-[#9aa59a]">/ 100</span>
                  </TableCell>
                  {classes.map((key) => {
                    const value =
                      participant.classes.find((item) => item.key === key)
                        ?.score ?? null
                    return (
                      <TableCell className="min-w-[150px]" key={key}>
                        <span className="mb-2 block font-mono text-[13px] leading-[normal] font-semibold">{score(value)}</span>
                        <Bar value={value} />
                      </TableCell>
                    )
                  })}
                  <TableCell className={numberClass}>
                    {duration(
                      participant.efficiency.meanDurationMs ?? undefined,
                    )}
                  </TableCell>
                  <TableCell className={numberClass}>
                    {cost(participant.efficiency.meanCostUsd)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function Tasks({ manifest }: { manifest: ResultManifest }) {
  const participants = scoreParticipants(
    manifest.runs,
    manifest.config.participantPricing,
  ).sort(compareParticipants)
  const taskIds = [...new Set(manifest.runs.map((run) => run.taskId))].sort()
  return (
    <section className={`${sectionClass} pt-[94px] max-[760px]:pt-[70px]`} id="tasks">
      <SectionHead
        title="Task breakdown"
        note="Each card shows a participant’s mean score across repeats for one task."
      />
      <div className="grid grid-cols-2 gap-[18px] max-[760px]:grid-cols-1">
        {taskIds.map((taskId) => {
          const taskClass =
            manifest.runs.find((run) => run.taskId === taskId)?.taskClass ?? ''
          return (
            <article className="border border-line bg-paper px-[31px] pt-7 pb-[33px] max-[430px]:p-[22px]" key={taskId}>
              <div className="font-mono text-[10px] leading-[normal] tracking-[0.06em] text-[#6c886f] uppercase">
                {CLASS_NAMES[taskClass] ?? taskClass}
              </div>
              <h3 className={`mt-[29px] font-serif text-[28px] leading-[normal] font-extrabold tracking-[-0.05em] ${TASK_DESCRIPTIONS[taskId] ? 'mb-2' : 'mb-[30px]'}`}>{taskId}</h3>
              {TASK_DESCRIPTIONS[taskId] && (
                <p className="mb-[30px] text-[13px] leading-[1.5] text-muted">{TASK_DESCRIPTIONS[taskId]}</p>
              )}
              <div className="flex flex-col gap-[18px]">
                {participants.map((participant) => {
                  const value =
                    participant.tasks.find((item) => item.key === taskId)
                      ?.score ?? null
                  return (
                    <div className="grid grid-cols-[130px_1fr_35px] items-center gap-4 max-[430px]:grid-cols-[105px_1fr_30px] max-[430px]:gap-2" key={participant.participantId}>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[1.5] font-semibold max-[430px]:text-[11px]">
                        <ParticipantName id={participant.participantId} />
                      </span>
                      <Bar value={value} />
                      <strong className="text-right font-mono text-xs leading-[normal] font-semibold">{score(value)}</strong>
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Runs({ manifest }: { manifest: ResultManifest }) {
  const stage = manifest.config.stage ?? DEFAULT_STAGE
  const metrics = STAGE_METRICS[stage]
  const showHidden = stage === 'full'
  const note = showHidden
    ? 'Held-out tests are reported separately from the score.'
    : undefined
  const sorted = [...manifest.runs].sort(
    (a, b) =>
      a.taskId.localeCompare(b.taskId) ||
      baselinePriority(a.participantId, b.participantId) ||
      a.participantId.localeCompare(b.participantId) ||
      a.repeat - b.repeat,
  )
  return (
    <section className={`${sectionClass} pt-[94px] pb-[90px] max-[760px]:pt-[70px] max-[760px]:pb-[65px]`} id="runs">
      <SectionHead title="Run scores" note={note} />
      <div className="overflow-x-auto border border-line bg-paper">
        <Table className={runTableClass}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Run</TableHead>
              {metrics.map((metric) => (
                <TableHead
                  key={metric}
                  scope="col"
                  className={numberClass}
                  title={METRIC_LABELS[metric]}
                >
                  {metric}
                </TableHead>
              ))}
              <TableHead scope="col" className={numberClass}>
                Time
              </TableHead>
              <TableHead scope="col" className={numberClass}>
                Cost
              </TableHead>
              <TableHead scope="col" className={numberClass}>
                Score
              </TableHead>
              {showHidden && (
                <TableHead scope="col" className={numberClass}>
                  Held-out tests
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((run) => {
              const value = scoreRun(
                run,
                manifest.runs,
                manifest.config.participantPricing,
              )
              const price = runCost(run, manifest.config.participantPricing)
              const hidden = run.hidden?.passRatio
              return (
                <TableRow key={run.runId}>
                  <TableCell>
                    <strong className="font-bold">
                      <ParticipantName id={run.participantId} />
                    </strong>
                    <span className="mt-1 block font-mono text-[11px] leading-[normal] text-[#95a196]">
                      {run.taskId}
                      {manifest.config.repeats > 1
                        ? ` · repeat ${run.repeat}`
                        : ''}
                    </span>
                  </TableCell>
                  {metrics.map((metric) => (
                    <TableCell className={numberClass} key={metric}>
                      {run.verdicts[metric] === undefined
                        ? '—'
                        : score(run.verdicts[metric]?.score ?? null)}
                    </TableCell>
                  ))}
                  <TableCell className={numberClass}>
                    {duration(
                      run.telemetry?.activeMs ?? run.telemetry?.durationMs,
                    )}
                  </TableCell>
                  <TableCell className={numberClass}>{cost(price.value)}</TableCell>
                  <TableCell className={`${numberClass} font-bold text-green`}>
                    {score(value.value)}
                  </TableCell>
                  {showHidden && (
                    <TableCell className={numberClass}>
                      {hidden === undefined
                        ? '—'
                        : `${Math.round(hidden * 100)}%`}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function MethodSummary() {
  return (
    <section className="scroll-mt-0 border-t border-[#dce4d9] bg-[#e9eee5]" id="method">
      <div className={`${sectionClass} pt-[78px] max-[760px]:pt-[62px]`}>
        <SectionHead
          title="How to read this result"
          note="How scores are calculated and where comparisons apply."
        />
        <div className="grid grid-cols-3 border-y border-[#cfdacd] max-[760px]:grid-cols-1">
          <div className="min-h-[215px] pt-[29px] pr-[27px] pb-7 max-[760px]:min-h-0 max-[760px]:py-6">
            <h3 className="mb-[9px] font-serif text-[19px] leading-[normal] font-bold tracking-[-0.035em]">One starting point</h3>
            <p className="m-0 text-[13px] leading-[1.65] text-[#607263]">
              Participants receive the same task and model. Each follows its
              own SDD workflow and required tools.
            </p>
          </div>
          <div className="min-h-[215px] border-l border-[#cfdacd] pt-[29px] pr-[27px] pb-7 pl-[30px] max-[760px]:min-h-0 max-[760px]:border-t max-[760px]:border-l-0 max-[760px]:px-0 max-[760px]:py-6">
            <h3 className="mb-[9px] font-serif text-[19px] leading-[normal] font-bold tracking-[-0.035em]">Decisions before scores</h3>
            <p className="m-0 text-[13px] leading-[1.65] text-[#607263]">
              Judges assess individual requirements and defects. The harness
              calculates scores from those decisions.
            </p>
          </div>
          <div className="min-h-[215px] border-l border-[#cfdacd] pt-[29px] pr-[27px] pb-7 pl-[30px] max-[760px]:min-h-0 max-[760px]:border-t max-[760px]:border-l-0 max-[760px]:px-0 max-[760px]:py-6">
            <h3 className="mb-[9px] font-serif text-[19px] leading-[normal] font-bold tracking-[-0.035em]">Quality, time, and cost</h3>
            <p className="m-0 text-[13px] leading-[1.65] text-[#607263]">
              Quality is the geometric mean of applicable metrics. Time
              contributes up to 5% and cost up to 2% within a task. Repeats
              average into tasks, tasks into classes, and classes into the final
              score.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ResultsBody({
  manifest,
  version,
}: {
  manifest: ResultManifest | undefined
  version: string
}) {
  return (
    <main id="top" className="overflow-hidden">
      <Summary version={version} />
      {manifest && manifest.runs.length > 0 ? (
        <>
          <Leaderboard manifest={manifest} />
          <Tasks manifest={manifest} />
          <Runs manifest={manifest} />
        </>
      ) : (
        <EmptyResults />
      )}
      <MethodSummary />
    </main>
  )
}
