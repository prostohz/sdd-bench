import { SectionHead, sectionClass } from './common.js'

export function MethodSummary() {
  return (
    <section className="scroll-mt-0 border-t border-[#dce4d9] bg-[#e9eee5]" id="method">
      <div className={`${sectionClass} pt-[78px] max-[760px]:pt-[62px]`}>
        <SectionHead
          title="How to read this result"
          note="How scores are calculated and where comparisons apply."
        />
        <div className="grid grid-cols-3 border-y border-[#dce4d9] max-[760px]:grid-cols-1">
          <div className="min-h-[215px] pt-[29px] pr-[27px] pb-7 max-[760px]:min-h-0 max-[760px]:py-6">
            <h3 className="mb-[9px] font-serif text-[19px] leading-[normal] font-bold tracking-[-0.035em]">One starting point</h3>
            <p className="m-0 text-[13px] leading-[1.65] text-[#607263]">
              Participants receive the same task and model. Each follows its
              own SDD workflow and required tools.
            </p>
          </div>
          <div className="min-h-[215px] border-l border-[#dce4d9] pt-[29px] pr-[27px] pb-7 pl-[30px] max-[760px]:min-h-0 max-[760px]:border-t max-[760px]:border-l-0 max-[760px]:px-0 max-[760px]:py-6">
            <h3 className="mb-[9px] font-serif text-[19px] leading-[normal] font-bold tracking-[-0.035em]">Decisions before scores</h3>
            <p className="m-0 text-[13px] leading-[1.65] text-[#607263]">
              Judges assess individual requirements and defects. The harness
              calculates scores from those decisions.
            </p>
          </div>
          <div className="min-h-[215px] border-l border-[#dce4d9] pt-[29px] pr-[27px] pb-7 pl-[30px] max-[760px]:min-h-0 max-[760px]:border-t max-[760px]:border-l-0 max-[760px]:px-0 max-[760px]:py-6">
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
