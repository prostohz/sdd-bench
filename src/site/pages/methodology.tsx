import { parseMethodology } from './methodology-content.js'

export function MethodologyBody({ source }: { source: string }) {
  const { title, contents, article } = parseMethodology(source)
  return (
    <main id="top" className="methodology-page">
      <section className="methodology-intro">
        <div className="methodology-intro-inner">
          <p className="methodology-eyebrow">The rules behind the results</p>
          <h1>{title}</h1>
          <p className="methodology-deck">
            Tasks, judging, scoring, and isolation: the protocol behind each
            published comparison.
          </p>
        </div>
      </section>
      <div className="methodology-layout">
        <aside className="methodology-aside" aria-label="On this page">
          <div className="methodology-toc">
            <ul dangerouslySetInnerHTML={{ __html: contents }} />
          </div>
        </aside>
        <article
          className="methodology-content"
          dangerouslySetInnerHTML={{ __html: article }}
        />
      </div>
    </main>
  )
}
