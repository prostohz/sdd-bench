import { parseMethodology } from './methodology-content.js'

export function MethodologyBody({ source }: { source: string }) {
  const { contents, article } = parseMethodology(source)
  return (
    <main id="top" className="methodology-page">
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
