import MarkdownIt from 'markdown-it'
import katex from 'katex'

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

export function escapeHtml(value: string): string {
  return markdown.utils.escapeHtml(value)
}

export function parseMethodology(source: string) {
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
        `<li><a href="#${section.id}">${escapeHtml(section.title)}</a></li>`,
    )
    .join('')
  const article = markdown.renderer.render(tokens, markdown.options, {})
  return { title, contents, article }
}
