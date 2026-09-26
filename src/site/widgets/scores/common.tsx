import type { ReactNode } from 'react'
import type { ParticipantScore } from '../../../score/score.js'
import { NAMES, REPOSITORIES } from './config.js'

export const sectionClass = 'mx-auto w-[var(--page-width)] scroll-mt-[30px] pt-[74px] max-[760px]:pt-[60px]'
export const numberClass = 'text-right tabular-nums whitespace-nowrap'
export const numberValueClass = `${numberClass} font-medium`
export const tableClass = 'w-full border-collapse text-left tabular-nums [&_th]:border-b [&_th]:border-line [&_th]:px-5 [&_th]:py-[18px] [&_td]:border-b [&_td]:border-line [&_td]:px-5 [&_td]:py-[18px] [&_thead]:bg-[#edf1e9] [&_thead_th]:whitespace-nowrap [&_thead_th]:text-[10px] [&_thead_th]:leading-[normal] [&_thead_th]:font-medium [&_thead_th]:tracking-[0.08em] [&_thead_th]:text-[#5a6b5d] [&_thead_th]:uppercase [&_tbody_tr:hover]:bg-[#f9fbf7] [&_tbody_tr:last-child>*]:border-b-0'
export const runTableClass = `${tableClass} table-fixed [&_th]:px-[19px] [&_th]:py-[15px] [&_td]:px-[19px] [&_td]:py-[15px] [&_thead_th]:text-[11px] [&_td]:text-sm`

export function score(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

export function duration(value: number | undefined): string {
  return value === undefined ? '—' : `${(value / 60_000).toFixed(1)} min`
}

export function cost(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(3)}`
}

export function Bar({ value }: { value: number | null }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <span className="block h-[10px] w-full overflow-hidden bg-[#e8ede5]" aria-hidden="true">
      <span className="block h-full bg-green-2" style={{ width: `${width}%` }} />
    </span>
  )
}

export function SectionHead({
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

export function ParticipantName({ id }: { id: string }): ReactNode {
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

export function baselinePriority(a: string, b: string): number {
  return Number(b === 'neutral') - Number(a === 'neutral')
}

export function compareParticipants(a: ParticipantScore, b: ParticipantScore): number {
  return (
    baselinePriority(a.participantId, b.participantId) ||
    (b.score ?? -1) - (a.score ?? -1) ||
    a.participantId.localeCompare(b.participantId)
  )
}
