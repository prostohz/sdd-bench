export function SiteHeader({ current }: { current: 'home' | 'methodology' }) {
  return (
    <header className="topbar">
      <a className="brand" href="./index.html">
        SDD BENCH
      </a>
      <nav aria-label="Sections">
        <a href="./index.html" aria-current={current === 'home' ? 'page' : undefined}>
          Scores
        </a>
        <a
          href="./methodology.html"
          aria-current={current === 'methodology' ? 'page' : undefined}
        >
          Methodology
        </a>
      </nav>
    </header>
  )
}
