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

test('pricing belongs to the selected participant model', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-bench-pricing-'))
  const path = join(root, 'bench.json')
  try {
    assert.equal(loadConfig(root).participantPricing?.inputUsdPerMillion, 2)
    writeFileSync(path, JSON.stringify({ participantModel: 'another-model' }))
    assert.equal(loadConfig(root).participantPricing, undefined)
    writeFileSync(path, JSON.stringify({ participantModel: 'another-model', participantPricing: {
      inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: 0.1,
      cacheWriteUsdPerMillion: 1,
      outputUsdPerMillion: 5,
    } }))
    assert.equal(loadConfig(root).participantPricing?.outputUsdPerMillion, 5)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
