import type { ResultManifest } from '../../model/run.js'
import { SectionHead, sectionClass } from '../widgets/scores/common.js'
import { OverallScores } from '../widgets/scores/overall-scores.js'
import { TaskBreakdown } from '../widgets/scores/task-breakdown.js'
import { RunScores } from '../widgets/scores/run-scores.js'
import { MethodSummary } from '../widgets/scores/method-summary.js'

function EmptyResults() {
  return (
    <section id="results" className={`${sectionClass} pb-3`}>
      <SectionHead title="Results" note="No data yet." />
    </section>
  )
}

function Summary({
  version,
  manifest,
  related,
}: {
  version: string
  manifest: ResultManifest | undefined
  related?: { href: string; label: string } | undefined
}) {
  return (
    <section className="border-b border-line bg-[radial-gradient(circle_at_88%_16%,#f0f4e6_0,transparent_32%),var(--bg)] px-[var(--page-inset)] pt-7 pb-8 max-[760px]:pt-6 max-[760px]:pb-7">
      <div className="mx-auto max-w-[var(--page-max)]">
        <div className="mb-3.5 inline-flex items-center gap-2.5 rounded bg-green px-[11px] py-2 text-[11px] leading-[normal] font-medium tracking-[0.08em] text-white">
          VERSION <span className="font-mono text-xs leading-[normal] tracking-normal text-lime">{version}</span>
        </div>
        <h1 className="m-0 font-serif text-[clamp(44px,4.5vw,68px)] leading-[1.07] font-extrabold tracking-[-0.075em] max-[1050px]:text-[clamp(42px,4.5vw,58px)] max-[760px]:text-[clamp(34px,7vw,44px)] max-[430px]:text-[34px]">
          From specification to <em className="not-italic text-green-2">results.</em>
        </h1>
        <p className="mt-3 max-w-[900px] text-base leading-[1.55] text-[#57675c] max-[760px]:text-[15px]">
          SDD workflows compared on the same tasks and model. Run limits and exceptions are described in the methodology.
        </p>
        {related && manifest && (
          <p className="mt-4 text-sm leading-[1.6] text-muted">
            Result <span className="font-mono">{manifest.resultId}</span> · {manifest.config.timeoutMs / 60000} min default limit · {manifest.config.repeats} repeat per participant
            <span className="mx-2">·</span>
            <a className="font-semibold text-green-2 underline underline-offset-[3px]" href={related.href}>{related.label}</a>
          </p>
        )}
      </div>
    </section>
  )
}

export function ResultsBody({
  manifest,
  version,
  related,
}: {
  manifest: ResultManifest | undefined
  version: string
  related?: { href: string; label: string } | undefined
}) {
  return (
    <main id="top" className="overflow-hidden">
      <Summary version={version} manifest={manifest} related={related} />
      {manifest && manifest.runs.length > 0 ? (
        <>
          <OverallScores manifest={manifest} />
          <TaskBreakdown manifest={manifest} />
          <RunScores manifest={manifest} />
        </>
      ) : (
        <EmptyResults />
      )}
      <MethodSummary />
    </main>
  )
}
