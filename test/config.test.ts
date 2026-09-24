import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { loadConfig } from '../src/config.js'

test('participant and judge share one provider', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-bench-config-'))
  const path = join(root, 'bench.json')
  try {
    writeFileSync(path, JSON.stringify({ participantProvider: 'claude', judgeProvider: 'claude' }))
    assert.equal(loadConfig(root).provider, 'claude')

    writeFileSync(path, JSON.stringify({ participantProvider: 'codex', judgeProvider: 'claude' }))
    assert.throws(() => loadConfig(root), /исполнитель и судья должны использовать одного провайдера/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
