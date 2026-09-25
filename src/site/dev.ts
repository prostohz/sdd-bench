import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createServer, type Plugin } from 'vite'
import { loadSiteManifest, previewManifest } from './data.js'

const args = process.argv.slice(2)
let result: string | undefined
let port = 5173
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  const value = args[i + 1]
  if ((arg === '--result' || arg === '--port') && value === undefined)
    throw new Error(`${arg}: a value is required`)
  if (arg === '--result') {
    result = value
    i += 1
  } else if (arg === '--port') {
    port = Number(value)
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('--port: expected an integer from 1 to 65535')
    i += 1
  } else {
    throw new Error(`unknown option: ${arg}`)
  }
}

const root = process.cwd()
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
const manifest = loadSiteManifest(root, result)
const preview = previewManifest(manifest)
const dataPlugin: Plugin = {
  name: 'site-preview-data',
  configureServer(server) {
    server.middlewares.use('/__site_data', (_request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ version, manifest: preview }))
    })
  },
}
const server = await createServer({
  configFile: false,
  root: join(root, 'src/site'),
  publicDir: false,
  plugins: [react(), tailwindcss(), dataPlugin],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    fs: { allow: [root] },
  },
})
await server.listen()
server.printUrls()
