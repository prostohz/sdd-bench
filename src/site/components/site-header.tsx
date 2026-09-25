import { renderToStaticMarkup } from 'react-dom/server'

function SiteHeader({ current }: { current: 'home' | 'methodology' }) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="masthead-overline">
          <span>Specification-driven development</span>
          <span>Independent benchmark</span>
        </div>
        <a className="brand" href="./index.html">
          SDD BENCH
        </a>
        <nav aria-label="Sections">
          <a
            href="./index.html"
            aria-current={current === 'home' ? 'page' : undefined}
          >
            Scores
          </a>
          <a
            href="./methodology.html"
            aria-current={current === 'methodology' ? 'page' : undefined}
          >
            Methodology
          </a>
        </nav>
      </div>
    </header>
  )
}

export function siteHeader(current: 'home' | 'methodology' = 'home'): string {
  return renderToStaticMarkup(<SiteHeader current={current} />)
}
