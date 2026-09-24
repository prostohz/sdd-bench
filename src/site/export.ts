import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { loadConfig } from '../config.js'
import { readManifest, resolveResult } from '../results.js'
import { scoreRun } from '../score/score.js'
import { renderMethodology } from './methodology.js'
import { renderSite } from './render.js'

const args = process.argv.slice(2)
let result: string | undefined
let out = 'public'
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  const next = args[i + 1]
  if ((arg === '--result' || arg === '--out') && next === undefined)
    throw new Error(`${arg}: a value is required`)
  if (arg === '--result') {
    result = next
    i += 1
  } else if (arg === '--out') {
    out = next ?? out
    i += 1
  } else {
    throw new Error(`unknown option: ${arg}`)
  }
}

const root = process.cwd()
const manifest =
  result === undefined ? undefined : readManifest(resolveResult(root, loadConfig(root), result))
if (manifest) {
  if (manifest.runs.length === 0) throw new Error('the result has no runs')
  const pending = manifest.runs.filter((run) => scoreRun(run).value === null)
  if (pending.length > 0) throw new Error(`the result is not fully judged: ${pending.length} runs`)
}
const destination = isAbsolute(out) ? out : resolve(root, out)
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'index.html'), renderSite(manifest))
writeFileSync(
  join(destination, 'methodology.html'),
  renderMethodology(readFileSync(join(root, 'METHODOLOGY.md'), 'utf8'), Boolean(manifest)),
)
copyFileSync(join(root, 'src/site/site.css'), join(destination, 'site.css'))
copyFileSync(join(root, 'src/site/favicon.svg'), join(destination, 'favicon.svg'))
writeFileSync(join(destination, '.nojekyll'), '')
process.stdout.write(`${join(destination, 'index.html')}\n`)
