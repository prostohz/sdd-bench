export function SiteHeader({ current }: { current: 'home' | 'methodology' }) {
  return (
    <header className="flex h-[76px] items-center gap-10 border-b border-line bg-bg px-[var(--page-inset)] max-[760px]:h-16">
      <a className="inline-flex items-center whitespace-nowrap font-serif text-base font-extrabold tracking-[-0.035em] max-[760px]:text-sm" href="./index.html">
        SDD BENCH
      </a>
      <nav aria-label="Sections" className="ml-auto flex self-stretch gap-8 text-base font-semibold text-[#4a5b50] max-[760px]:gap-[15px] max-[760px]:text-sm">
        <a className="inline-flex items-center border-b-2 border-transparent pt-0.5 hover:text-green-2 aria-[current=page]:border-green aria-[current=page]:text-green" href="./index.html" aria-current={current === 'home' ? 'page' : undefined}>
          Scores
        </a>
        <a
          className="inline-flex items-center border-b-2 border-transparent pt-0.5 hover:text-green-2 aria-[current=page]:border-green aria-[current=page]:text-green"
          href="./methodology.html"
          aria-current={current === 'methodology' ? 'page' : undefined}
        >
          Methodology
        </a>
      </nav>
    </header>
  )
}
