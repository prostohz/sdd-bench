import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import type { BenchConfig } from '../config.js'
import type { RunEntry } from '../results.js'
import {
  findEntry,
  findResult,
  implDiff,
  implFiles,
  listResults,
  readImpl,
  readSpec,
  runDirName,
  specFiles,
  type ResultView,
} from './data.js'
import { comparePage, filePage, page, resultPage, resultsPage, runPage, type RunPageData } from './pages.js'

export interface ServeOptions {
  root: string
  config: BenchConfig
  port: number
  host: string
}

/**
 * A local reader for finished runs. It keeps no state of its own: every
 * request reads `results/` as it is on disk, so a progressing run shows up
 * by reloading the page.
 */
export function serve(options: ServeOptions): Promise<string> {
  const server = createServer((request, response) => {
    handle(options, request, response).catch((error: unknown) => {
      send(response, 500, page('ошибка', `<h1>Ошибка</h1><pre>${describe(error)}</pre>`))
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : options.port
      resolve(`http://${options.host}:${port}/`)
    })
  })
}

async function handle(
  options: ServeOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const parts = url.pathname.split('/').filter((part) => part !== '')

  if (parts.length === 0) {
    send(response, 200, resultsPage(listResults(options.root, options.config)))
    return
  }

  if (parts[0] === 'cmp') {
    await compare(options, url, response)
    return
  }

  if (parts[0] !== 'r' || parts[1] === undefined) {
    send(response, 404, notFound())
    return
  }

  const result = findResult(options.root, options.config, parts[1])
  if (result === undefined) {
    send(response, 404, notFound())
    return
  }

  if (parts[2] === undefined) {
    send(response, 200, resultPage(result))
    return
  }

  const entry = findEntry(result, parts[2])
  if (entry === undefined) {
    send(response, 404, notFound())
    return
  }

  const back = `/r/${result.id}/${runDirName(entry)}`
  const path = url.searchParams.get('path') ?? ''

  switch (parts[3]) {
    case undefined:
      send(response, 200, runPage(await pageData(result, entry)))
      return
    case 'spec': {
      const text = await readSpec(entry, path)
      send(response, text === undefined ? 404 : 200, text === undefined ? notFound() : filePage(path, back, 'запуск', text))
      return
    }
    case 'impl': {
      const text = await readImpl(entry, path)
      send(response, text === undefined ? 404 : 200, text === undefined ? notFound() : filePage(path, back, 'запуск', text))
      return
    }
    case 'diff':
      send(response, 200, filePage('diff', back, 'запуск', await implDiff(entry), true))
      return
    default:
      send(response, 404, notFound())
  }
}

async function compare(options: ServeOptions, url: URL, response: ServerResponse): Promise<void> {
  const result = findResult(options.root, options.config, url.searchParams.get('r') ?? '')
  const a = result && findEntry(result, url.searchParams.get('a') ?? '')
  const b = result && findEntry(result, url.searchParams.get('b') ?? '')

  if (!result || !a || !b) {
    send(response, 404, notFound())
    return
  }
  send(response, 200, comparePage(result, await pageData(result, a), await pageData(result, b)))
}

async function pageData(result: ResultView, entry: RunEntry): Promise<RunPageData> {
  return { result, entry, spec: specFiles(entry), impl: await implFiles(entry) }
}

function notFound(): string {
  return page('не найдено', '<h1>Не найдено</h1><p><a href="/">к списку результатов</a></p>')
}

function send(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  response.end(body)
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
}
