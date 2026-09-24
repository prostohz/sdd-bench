import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { siteHeader } from './render.js'
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: true })
const renderFence = markdown.renderer.rules.fence
if (!renderFence) throw new Error('Markdown fence renderer unavailable')
markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index]
  if (token?.info.trim() === 'math') {
    return `<div class="math-formula">${katex.renderToString(token.content.trim(), {
      displayMode: true,
      output: 'htmlAndMathml',
      throwOnError: true,
      trust: false,
    })}</div>`
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
    .map((section) => `<li><a href="#${section.id}">${esc(section.title)}</a></li>`)
    .join('')
  const article = markdown.renderer.render(tokens, markdown.options, {})
  const body = `<main id="top" class="methodology-page"><div class="methodology-layout"><h1 class="methodology-title">${esc(title)}</h1><aside class="methodology-aside"><div class="methodology-toc"><ul>${contents}</ul><a class="toc-back" href="./index.html#results">← Back to scores</a></div></aside><article class="methodology-content">${article}</article></div></main>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="SDD Bench methodology: tasks, judging, scoring, and run isolation."><meta name="theme-color" content="#155b3d"><title>${esc(title)} — SDD Bench</title><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./katex/katex.min.css"><link rel="stylesheet" href="./site.css"></head><body>${siteHeader('methodology')}${body}</body></html>\n`
}
