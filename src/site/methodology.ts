import MarkdownIt from 'markdown-it'
import { siteHeader } from './render.js'
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: true })
function esc(value: string): string {
  return markdown.utils.escapeHtml(value)
}
export function renderMethodology(source: string, hasResults = false): string {
  const lines = source.trim().split(/\r?\n/)
  const first = lines[0] ?? ''
  const title = first.startsWith('# ') ? first.slice(2).trim() : 'Methodology'
  if (first.startsWith('# ')) lines.shift()
  const tokens = markdown.parse(lines.join('\n'), {})
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
      (section, index) =>
        `<li><a href="#${section.id}"><span>${String(index + 1).padStart(2, '0')}</span>${esc(section.title)}</a></li>`,
    )
    .join('')
  const article = markdown.renderer.render(tokens, markdown.options, {})
  const body = `<main id="top" class="methodology-page"><section class="methodology-hero"><div class="methodology-hero-inner"><div class="hero-kicker"><span class="kicker-line"></span> SDD BENCH / METHOD</div><div class="methodology-hero-grid"><div><span class="methodology-eyebrow">ABOUT THE BENCHMARK</span><h1>${esc(title)}<span>.</span></h1><p>How tasks and runs work, what judges see, and how their decisions become scores.</p></div><div class="methodology-sequence" aria-hidden="true"><span>INTENT</span><i>→</i><span>SPECIFICATION</span><i>→</i><span>IMPLEMENTATION</span></div></div></div></section><div class="methodology-layout"><aside class="methodology-aside"><div class="methodology-toc"><span class="toc-label">ON THIS PAGE</span><ol>${contents}</ol><a class="toc-back" href="./index.html#results">← Back to results</a></div></aside><article class="methodology-content">${article}</article></div></main>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="SDD Bench methodology: tasks, judging, scoring, and run isolation."><meta name="theme-color" content="#155b3d"><title>${esc(title)} — SDD Bench</title><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./site.css"></head><body>${siteHeader(hasResults, 'methodology')}${body}</body></html>\n`
}
