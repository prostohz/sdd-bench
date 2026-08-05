import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BenchConfig } from '../config.js'
import type { SandboxDriver } from '../sandbox/driver.js'
import { runClaude } from './claude.js'

const PROBE_PATH = '/tmp/sdd-bench/probe.md'
const PROBE_TIMEOUT_MS = 5 * 60 * 1000

/**
 * One throwaway sandbox and one trivial agent turn, before the matrix starts.
 * A broken credential otherwise shows up only after every run has burned its
 * setup — and shows up as a participant scoring zero, which it did not earn.
 */
export async function checkAgent(driver: SandboxDriver, config: BenchConfig): Promise<string | undefined> {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-bench-doctor-'))
  const probe = join(dir, 'probe.md')
  writeFileSync(probe, 'Ответь одним словом: готово')

  const sandbox = await driver.create({
    name: 'sdd-bench-doctor',
    workspace: dir,
    agent: 'claude',
    clone: false,
  })

  try {
    await sandbox.allowHosts(config.allowHosts)
    await sandbox.copyIn(probe, PROBE_PATH)

    const run = await runClaude(sandbox, {
      model: config.model,
      effort: config.effort,
      promptPath: PROBE_PATH,
      timeoutMs: PROBE_TIMEOUT_MS,
    })

    if (run.proc.timedOut) return 'пробный запрос к агенту не уложился в лимит'
    if (run.parseError) return `агент ответил не JSON-результатом: ${run.parseError}`
    if (run.result?.isError) return `агент не смог выполнить запрос: ${run.result.text.trim()}`
    return undefined
  } finally {
    await sandbox.remove()
    rmSync(dir, { recursive: true, force: true })
  }
}

/** What to do about the failures this check actually runs into. */
export function agentHint(failure: string): string {
  if (/api[- ]key|invalid|authentication/i.test(failure)) {
    return (
      'ключ Anthropic в sandbox не принят. Проверьте секрет на хосте:\n' +
      '  sbx secret ls\n' +
      '  sbx secret set -g anthropic --force\n' +
      'Подписка Claude вместо ключа не подойдёт: вход по OAuth интерактивен и не ' +
      'переживает пересоздание sandbox, а бенчмарк создаёт новый на каждый запуск.'
    )
  }
  if (/not logged in|login/i.test(failure)) {
    return (
      'агент не видит учётных данных. Убедитесь, что секрет задан:\n' +
      '  sbx secret set -g anthropic'
    )
  }
  return 'проверьте `sbx policy ls` — доступ к api.anthropic.com должен быть разрешён'
}
