import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { isAbsolute, join, resolve } from 'node:path'

import { loadSiteManifest } from './data.js'
import { renderMethodology } from './render/methodology.js'
import { renderSite } from './render/results.js'

const args = process.argv.slice(2)
let result: string | undefined
let previousResult: string | undefined
let out = 'public'
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  const next = args[i + 1]
  if ((arg === '--result' || arg === '--previous-result' || arg === '--out') && next === undefined)
    throw new Error(`${arg}: a value is required`)
  if (arg === '--result') {
    result = next
    i += 1
  } else if (arg === '--previous-result') {
    previousResult = next
    i += 1
  } else if (arg === '--out') {
    out = next ?? out
    i += 1
  } else {
    throw new Error(`unknown option: ${arg}`)
  }
}

const root = process.cwd()
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version: string
}
const manifest = loadSiteManifest(root, result)
const previousManifest = loadSiteManifest(root, previousResult)
if (previousManifest && !manifest) throw new Error('--previous-result requires --result')
if (previousResult === result && previousResult !== undefined) throw new Error('the result and previous result must differ')
const destination = isAbsolute(out) ? out : resolve(root, out)
mkdirSync(destination, { recursive: true })
execFileSync(process.execPath, [
  join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
  '-i', join(root, 'src/site/site.css'),
  '-o', join(destination, 'site.css'),
  '--minify',
], { stdio: 'inherit' })
const cssVersion = createHash('sha256').update(readFileSync(join(destination, 'site.css'))).digest('hex').slice(0, 12)
writeFileSync(
  join(destination, 'index.html'),
  renderSite(manifest, version, cssVersion, previousManifest ? { href: './previous.html', label: 'Earlier results' } : undefined),
)
if (previousManifest) {
  writeFileSync(
    join(destination, 'previous.html'),
    renderSite(previousManifest, version, cssVersion, { href: './index.html', label: 'Latest result' }),
  )
} else {
  rmSync(join(destination, 'previous.html'), { force: true })
}
writeFileSync(
  join(destination, 'methodology.html'),
  renderMethodology(readFileSync(join(root, 'METHODOLOGY.md'), 'utf8'), cssVersion),
)
copyFileSync(join(root, 'src/site/favicon.svg'), join(destination, 'favicon.svg'))
copyFileSync(join(root, 'src/site/PHOSPHOR-LICENSE.txt'), join(destination, 'PHOSPHOR-LICENSE.txt'))
const katexSource = join(root, 'node_modules/katex/dist')
const katexDestination = join(destination, 'katex')
mkdirSync(katexDestination, { recursive: true })
copyFileSync(join(katexSource, 'katex.min.css'), join(katexDestination, 'katex.min.css'))
cpSync(join(katexSource, 'fonts'), join(katexDestination, 'fonts'), { recursive: true })
writeFileSync(join(destination, '.nojekyll'), '')
process.stdout.write(`${join(destination, 'index.html')}\n`)
