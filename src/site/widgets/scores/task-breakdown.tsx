import type { ResultManifest } from '../../../model/run.js'
import { scoreParticipants } from '../../../score/score.js'
import { CLASS_NAMES, TASK_DESCRIPTIONS } from './config.js'
import {
  Bar,
  compareParticipants,
  ParticipantName,
  score,
  SectionHead,
  sectionClass,
} from './common.js'

export function TaskBreakdown({ manifest }: { manifest: ResultManifest }) {
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
      <div className="grid grid-cols-3 gap-[18px] max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1">
        {taskIds.map((taskId) => {
          const taskClass =
            manifest.runs.find((run) => run.taskId === taskId)?.taskClass ?? ''
          return (
            <article className="border border-line bg-paper px-[31px] pt-7 pb-[33px] max-[430px]:p-[22px]" key={taskId}>
              <div className="text-xs leading-[normal] tracking-[0.06em] text-[#6c886f] uppercase">
                {CLASS_NAMES[taskClass] ?? taskClass}
              </div>
              <h3 className={`mt-[29px] font-serif text-[28px] leading-[normal] font-extrabold tracking-[-0.05em] ${TASK_DESCRIPTIONS[taskId] ? 'mb-2' : 'mb-[30px]'}`}>{taskId}</h3>
              {TASK_DESCRIPTIONS[taskId] && (
                <p className="mb-[30px] text-[15px] leading-[1.5] text-muted">{TASK_DESCRIPTIONS[taskId]}</p>
              )}
              <div className="flex flex-col gap-[18px]">
                {participants.map((participant) => {
                  const value =
                    participant.tasks.find((item) => item.key === taskId)
                      ?.score ?? null
                  return (
                    <div className="grid grid-cols-[130px_1fr_42px] items-center gap-4 max-[430px]:grid-cols-[105px_1fr_42px] max-[430px]:gap-2" key={participant.participantId}>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-[1.5] font-semibold max-[430px]:text-[13px]">
                        <ParticipantName id={participant.participantId} />
                      </span>
                      <Bar value={value} />
                      <strong className="text-right tabular-nums text-sm leading-[normal] font-semibold">{score(value)}</strong>
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
