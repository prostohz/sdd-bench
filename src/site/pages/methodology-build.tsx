import { renderToStaticMarkup } from 'react-dom/server'
import { SiteHeader } from '../components/site-header.js'
import { MethodologyBody } from './methodology.js'
import { escapeHtml, parseMethodology } from './methodology-content.js'

export function renderMethodology(source: string): string {
  const { title } = parseMethodology(source)
  const body = renderToStaticMarkup(
    <>
      <SiteHeader current="methodology" />
      <MethodologyBody source={source} />
    </>,
  )
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="SDD Bench methodology: tasks, judging, scoring, and run isolation."><meta name="theme-color" content="#f5f2eb"><title>${escapeHtml(title)} — SDD Bench</title><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./katex/katex.min.css"><link rel="stylesheet" href="./site.css"></head><body>${body}</body></html>\n`
}
