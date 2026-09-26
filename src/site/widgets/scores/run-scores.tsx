import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js'
import type { ResultManifest } from '../../../model/run.js'
import { DEFAULT_STAGE, STAGE_METRICS } from '../../../model/stage.js'
import { runCost, scoreRun } from '../../../score/score.js'
import { METRIC_HINTS } from './config.js'
import {
  baselinePriority,
  cost,
  duration,
  numberClass,
  numberValueClass,
  ParticipantName,
  runTableClass,
  score,
  SectionHead,
  sectionClass,
} from './common.js'

export function RunScores({ manifest }: { manifest: ResultManifest }) {
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
        <Table className={`${runTableClass} ${showHidden ? 'min-w-[1000px]' : 'min-w-[760px]'}`}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-[180px]">Run</TableHead>
              {metrics.map((metric) => (
                <TableHead
                  key={metric}
                  scope="col"
                  className={numberClass}
                >
                  <abbr
                    className="cursor-help underline decoration-dotted underline-offset-[3px]"
                    title={METRIC_HINTS[metric]}
                  >
                    {metric}
                  </abbr>
                </TableHead>
              ))}
              <TableHead scope="col" className={numberClass}>
                Time
              </TableHead>
              <TableHead scope="col" className={numberClass}>
                Cost
              </TableHead>
              {showHidden && (
                <TableHead scope="col" className={numberClass}>
                  <span
                    className="inline-block cursor-help whitespace-normal underline decoration-dotted underline-offset-[3px]"
                    title="Share of held-out tests passed; reported separately from the score"
                  >
                    Held-out tests
                  </span>
                </TableHead>
              )}
              <TableHead scope="col" className={numberClass}>
                Score
              </TableHead>
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
                <TableRow
                  key={run.runId}
                  className={
                    run.participantId === 'neutral'
                      ? 'bg-[#f2f3ef] hover:bg-[#ebeee8] [&>*]:border-b-2 [&>*]:border-[#dfe5dc]'
                      : 'hover:bg-[#f9fbf7]'
                  }
                >
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
                    <TableCell className={numberValueClass} key={metric}>
                      {run.verdicts[metric] === undefined
                        ? '—'
                        : score(run.verdicts[metric]?.score ?? null)}
                    </TableCell>
                  ))}
                  <TableCell className={numberValueClass}>
                    {duration(
                      run.telemetry?.activeMs ?? run.telemetry?.durationMs,
                    )}
                  </TableCell>
                  <TableCell className={numberValueClass}>{cost(price.value)}</TableCell>
                  {showHidden && (
                    <TableCell className={numberValueClass}>
                      {hidden === undefined
                        ? '—'
                        : `${Math.round(hidden * 100)}%`}
                    </TableCell>
                  )}
                  <TableCell className={`${numberClass} font-bold text-green`}>
                    {score(value.value)}
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
