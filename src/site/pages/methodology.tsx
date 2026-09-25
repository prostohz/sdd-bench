import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { siteHeader } from '../components/site-header.js'
import { renderToStaticMarkup } from 'react-dom/server'
const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: true,
})
const renderFence = markdown.renderer.rules.fence
if (!renderFence) throw new Error('Markdown fence renderer unavailable')
markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index]
  if (token?.info.trim() === 'math') {
    return `<div class="math-formula">${katex.renderToString(
      token.content.trim(),
      {
        displayMode: true,
        output: 'htmlAndMathml',
        throwOnError: true,
        trust: false,
      },
    )}</div>`
  }
  return renderFence(tokens, index, options, env, self)
}
function esc(value: string): string {
  return markdown.utils.escapeHtml(value)
}
export function renderMethodology(source: string): string {
  const lines = source.trim().split(/\r?\n/)
  const first = lines[0] ?? ''
  const title = first.startsWith('# ') ? first.slice(2).trim() : 'Methodology'
  if (first.startsWith('# ')) lines.shift()
  const visibleLines: string[] = []
  let hidden = false
  for (const line of lines) {
    if (line.startsWith('## ')) hidden = line.trim() === '## Workflow stages'
    if (!hidden) visibleLines.push(line)
  }
  const tokens = markdown.parse(visibleLines.join('\n'), {})
  const sections: { id: string; title: string }[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token?.type !== 'heading_open' || token.tag !== 'h2') continue
    const heading = tokens[i + 1]?.content.trim() ?? ''
    const id = `section-${sections.length + 1}`
    token.attrSet('id', id)
    sections.push({ id, title: heading })
  }
  const contents = sections
    .map(
      (section) =>
        `<li><a href="#${section.id}">${esc(section.title)}</a></li>`,
    )
    .join('')
  const article = markdown.renderer.render(tokens, markdown.options, {})
  const body = renderToStaticMarkup(
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
    </main>,
  )
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="SDD Bench methodology: tasks, judging, scoring, and run isolation."><meta name="theme-color" content="#f5f2eb"><title>${esc(title)} — SDD Bench</title><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./katex/katex.min.css"><link rel="stylesheet" href="./site.css"></head><body>${siteHeader('methodology')}${body}</body></html>\n`
}
