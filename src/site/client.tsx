import { createRoot } from 'react-dom/client'
import type { ResultManifest } from '../model/run.js'
import { SiteHeader } from './components/site-header.js'
import { MethodologyBody } from './pages/methodology.js'
import { ResultsBody } from './pages/results.js'
import methodologySource from '../../METHODOLOGY.md?raw'
import 'katex/dist/katex.min.css'
import './site.css'

const element = document.getElementById('root')
if (!element) throw new Error('site root is missing')
const root = createRoot(element)

function showMethodology(source: string) {
  root.render(
    <>
      <SiteHeader current="methodology" />
      <MethodologyBody source={source} />
    </>,
  )
}

if (window.location.pathname.endsWith('/methodology.html')) {
  showMethodology(methodologySource)
  import.meta.hot?.accept('../../METHODOLOGY.md?raw', (module) => {
    if (module) showMethodology(module.default)
  })
} else {
  fetch('/__site_data')
    .then((response) => {
      if (!response.ok) throw new Error(`site data: ${response.status}`)
      return response.json() as Promise<{ version: string; manifest: ResultManifest | null }>
    })
    .then(({ version, manifest }) => {
      root.render(
        <>
          <SiteHeader current="home" />
          <ResultsBody manifest={manifest ?? undefined} version={version} />
        </>,
      )
    })
    .catch((error: unknown) => {
      root.render(<pre>{String(error)}</pre>)
    })
}
