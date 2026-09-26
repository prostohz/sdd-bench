import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js'
import type { ResultManifest } from '../../../model/run.js'
import { participantVersions } from '../../../model/versions.js'
import { scoreParticipants } from '../../../score/score.js'
import { CLASS_NAMES } from './config.js'
import {
  Bar,
  compareParticipants,
  cost,
  duration,
  numberClass,
  numberValueClass,
  ParticipantName,
  score,
  SectionHead,
  sectionClass,
  tableClass,
} from './common.js'

export function OverallScores({ manifest }: { manifest: ResultManifest }) {
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
        <Table className={`${tableClass} min-w-[760px]`}>
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
              ).map((version) =>
                participant.participantId === 'canon'
                  ? version.replace(/^@canon\/cli\s+/, '')
                  : version,
              )
              return (
                <TableRow
                  key={participant.participantId}
                  className={
                    participant.participantId === 'neutral'
                      ? 'bg-[#f2f3ef] hover:bg-[#ebeee8] [&>*]:border-b-2 [&>*]:border-[#dfe5dc]'
                      : 'hover:bg-[#f9fbf7]'
                  }
                >
                  <th scope="row" className="font-medium">
                    <span className="block whitespace-nowrap font-serif text-base leading-[normal] font-bold tracking-[-0.025em]">
                      <ParticipantName id={participant.participantId} />
                    </span>
                    {participant.participantId === 'neutral' ? (
                      <span className="mt-1 block text-[9px] leading-[1.4] text-[#8c978e]">
                        Naive model planning
                      </span>
                    ) : versions.length > 0 ? (
                      <span className="mt-1 block text-[11px] leading-[normal] text-muted">
                        Tool version: <span className="font-mono">{versions.join(', ')}</span>
                      </span>
                    ) : null}
                  </th>
                  <TableCell className="whitespace-nowrap">
                    <strong className="font-serif text-[28px] leading-[normal] font-extrabold tracking-[-0.06em] text-green">{score(participant.score)}</strong>
                    <span className="ml-[3px] text-[11px] leading-[normal] text-[#9aa59a]">/ 100</span>
                  </TableCell>
                  {classes.map((key) => {
                    const value =
                      participant.classes.find((item) => item.key === key)
                        ?.score ?? null
                    return (
                      <TableCell className="min-w-[150px]" key={key}>
                        <span className="mb-2 block text-[13px] leading-[normal] font-semibold">{score(value)}</span>
                        <Bar value={value} />
                      </TableCell>
                    )
                  })}
                  <TableCell className={numberValueClass}>
                    {duration(
                      participant.efficiency.meanDurationMs ?? undefined,
                    )}
                  </TableCell>
                  <TableCell className={numberValueClass}>
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
