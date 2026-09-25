import { renderToStaticMarkup } from 'react-dom/server'
import type { ResultManifest } from '../../model/run.js'
import { SiteHeader } from '../components/site-header.js'
import { ResultsBody } from './results.js'

export function renderSite(manifest: ResultManifest | undefined, version: string): string {
  const body = renderToStaticMarkup(
    <>
      <SiteHeader current="home" />
      <ResultsBody manifest={manifest} version={version} />
    </>,
  )
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="SDD Bench: results of a specification-driven development benchmark."><meta name="theme-color" content="#f5f2eb"><title>Scores — SDD Bench</title><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./site.css"></head><body>${body}</body></html>\n`
}
