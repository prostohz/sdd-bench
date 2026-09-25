import type { ReactNode } from 'react'
import { Button } from '../components/ui/button.js'
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
}
const REPOSITORIES: Record<string, string> = {
  openspec: 'https://github.com/Fission-AI/OpenSpec',
  gsd: 'https://github.com/open-gsd/gsd-core',
  speckit: 'https://github.com/github/spec-kit',
  bmad: 'https://github.com/bmad-code-org/BMAD-METHOD',
}
const CLASS_NAMES: Record<string, string> = {
  greenfield: 'Greenfield',
  'brownfield-nospec': 'Brownfield · no specification',
  'brownfield-spec': 'Brownfield · current specification',
}

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
    <span className="bar" aria-hidden="true">
      <span style={{ width: `${width}%` }} />
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
    <div className="section-head">
      <h2>{title}</h2>
      {note && <p>{note}</p>}
    </div>
  )
}

function ParticipantName({ id }: { id: string }): ReactNode {
  const name = NAMES[id] ?? id
  const repository = REPOSITORIES[id]
  return repository ? (
    <a
      className="participant-link"
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

function EmptySite() {
  return (
    <main id="top">
      <section className="hero empty-hero">
        <div className="hero-layout">
          <div>
            <h1>
              From intent
              <br />
              to working
              <br />
              <span>code.</span>
            </h1>
            <p className="hero-intro">
              Comparing specification-driven workflows by specification quality,
              implementation fidelity, and effort.
            </p>
            <Button asChild variant="link" size="link" className="hero-link">
              <a href="./methodology.html">
                How the benchmark works <span aria-hidden="true">↗</span>
              </a>
            </Button>
          </div>
          <div className="pipeline" aria-label="Benchmark pipeline">
            <div>
              <span>01</span>
              <strong>Intent</strong>
            </div>
            <div>
              <span>02</span>
              <strong>Specification</strong>
            </div>
            <div>
              <span>03</span>
              <strong>Implementation</strong>
            </div>
          </div>
        </div>
      </section>
      <section id="results" className="content empty-state">
        <SectionHead title="Results" note="No public runs yet." />
        <div className="empty-panel">
          <span className="empty-symbol" aria-hidden="true">
            ∅
          </span>
          <div>
            <h3>The first result is in progress</h3>
            <p>
              Once a run is complete and reviewed, participant scores and task
              comparisons will appear here.
            </p>
          </div>
        </div>
      </section>
      <MethodSummary />
    </main>
  )
}

function Summary({
  manifest,
  version,
}: {
  manifest: ResultManifest
  version: string
}) {
  const tasks = new Set(manifest.runs.map((run) => run.taskId)).size
  const participants = new Set(manifest.runs.map((run) => run.participantId))
    .size
  return (
    <section className="hero results-hero">
      <div className="results-hero-content">
        <div className="edition">
          VERSION <span>{version}</span>
        </div>
        <div className="hero-columns">
          <div>
            <h1>
              From specification to <span>results.</span>
            </h1>
            <p className="hero-intro">
              SDD workflows compared on the same tasks, model, and settings.
            </p>
          </div>
          <div className="hero-facts">
            <div>
              <strong>{tasks.toString().padStart(2, '0')}</strong>
              <span>Tasks</span>
            </div>
            <div>
              <strong>{participants.toString().padStart(2, '0')}</strong>
              <span>Workflows</span>
            </div>
          </div>
        </div>
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
    <section className="content" id="results">
      <SectionHead
        title="Overall scores"
        note="Baseline first; methods ranked by score across included task classes."
      />
      <div className="table-shell">
        <Table className="leaderboard">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Participant</TableHead>
              <TableHead scope="col">Score</TableHead>
              {classes.map((key) => (
                <TableHead scope="col" key={key}>
                  {CLASS_NAMES[key] ?? key}
                </TableHead>
              ))}
              <TableHead scope="col" className="number">
                Avg. time
              </TableHead>
              <TableHead scope="col" className="number">
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
                      ? 'baseline-row'
                      : undefined
                  }
                >
                  <th scope="row">
                    <span className="participant-name">
                      <ParticipantName id={participant.participantId} />
                    </span>
                    {participant.participantId === 'neutral' ? (
                      <span className="baseline-meta">
                        Naive model planning
                      </span>
                    ) : versions.length > 0 ? (
                      <span className="tool-version">
                        Tool version: {versions.join(', ')}
                      </span>
                    ) : null}
                  </th>
                  <TableCell className="total-cell">
                    <strong>{score(participant.score)}</strong>
                    <span>/ 100</span>
                  </TableCell>
                  {classes.map((key) => {
                    const value =
                      participant.classes.find((item) => item.key === key)
                        ?.score ?? null
                    return (
                      <TableCell className="class-cell" key={key}>
                        <span>{score(value)}</span>
                        <Bar value={value} />
                      </TableCell>
                    )
                  })}
                  <TableCell className="number">
                    {duration(
                      participant.efficiency.meanDurationMs ?? undefined,
                    )}
                  </TableCell>
                  <TableCell className="number">
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
    <section className="content task-section" id="tasks">
      <SectionHead
        title="Task breakdown"
        note="Each task shows a participant’s mean score across repeats."
      />
      <div className="task-grid">
        {taskIds.map((taskId) => {
          const taskClass =
            manifest.runs.find((run) => run.taskId === taskId)?.taskClass ?? ''
          return (
            <article className="task-card" key={taskId}>
              <div className="task-card-head">
                <div className="task-top">
                  {CLASS_NAMES[taskClass] ?? taskClass}
                </div>
                <h3>{taskId}</h3>
              </div>
              <div className="task-bars">
                {participants.map((participant) => {
                  const value =
                    participant.tasks.find((item) => item.key === taskId)
                      ?.score ?? null
                  return (
                    <div className="task-row" key={participant.participantId}>
                      <span>
                        <ParticipantName id={participant.participantId} />
                      </span>
                      <Bar value={value} />
                      <strong>{score(value)}</strong>
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
    <section className="content runs-section" id="runs">
      <SectionHead title="Run scores" note={note} />
      <div className="table-shell">
        <Table className="runs-table">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Run</TableHead>
              {metrics.map((metric) => (
                <TableHead
                  key={metric}
                  scope="col"
                  className="number"
                  title={METRIC_LABELS[metric]}
                >
                  {metric}
                </TableHead>
              ))}
              <TableHead scope="col" className="number">
                Time
              </TableHead>
              <TableHead scope="col" className="number">
                Cost
              </TableHead>
              <TableHead scope="col" className="number">
                Score
              </TableHead>
              {showHidden && (
                <TableHead scope="col" className="number">
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
                    <strong>
                      <ParticipantName id={run.participantId} />
                    </strong>
                    <span className="run-sub">
                      {run.taskId}
                      {manifest.config.repeats > 1
                        ? ` · repeat ${run.repeat}`
                        : ''}
                    </span>
                  </TableCell>
                  {metrics.map((metric) => (
                    <TableCell className="number" key={metric}>
                      {run.verdicts[metric] === undefined
                        ? '—'
                        : score(run.verdicts[metric]?.score ?? null)}
                    </TableCell>
                  ))}
                  <TableCell className="number">
                    {duration(
                      run.telemetry?.activeMs ?? run.telemetry?.durationMs,
                    )}
                  </TableCell>
                  <TableCell className="number">{cost(price.value)}</TableCell>
                  <TableCell className="number run-score">
                    {score(value.value)}
                  </TableCell>
                  {showHidden && (
                    <TableCell className="number">
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
    <section className="method" id="method">
      <div className="content">
        <SectionHead
          title="How to read this result"
          note="How scores are calculated and where comparisons apply."
        />
        <div className="method-grid">
          <div className="method-item">
            <h3>One starting point</h3>
            <p>
              Participants receive the same task, model, and limits. Only the
              SDD workflow and its tools differ.
            </p>
          </div>
          <div className="method-item">
            <h3>Decisions before scores</h3>
            <p>
              Judges assess individual requirements and defects. The harness
              calculates scores from those decisions.
            </p>
          </div>
          <div className="method-item">
            <h3>Quality, time, and cost</h3>
            <p>
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
  return manifest && manifest.runs.length > 0 ? (
      <main id="top">
        <Summary manifest={manifest} version={version} />
        <Leaderboard manifest={manifest} />
        <Tasks manifest={manifest} />
        <Runs manifest={manifest} />
        <MethodSummary />
      </main>
    ) : (
      <EmptySite />
    )
}
