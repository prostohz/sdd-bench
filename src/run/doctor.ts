import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BenchConfig } from '../config.js'
import type { SandboxDriver } from '../sandbox/driver.js'
import { providerHosts, runAgent } from './agent.js'

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
    agent: config.participantProvider,
    clone: false,
  })

  try {
    await sandbox.allowHosts([...providerHosts(config.participantProvider), ...config.allowHosts])
    await sandbox.copyIn(probe, PROBE_PATH)

    const run = await runAgent(sandbox, config.participantProvider, {
      model: config.participantModel,
      effort: config.participantEffort,
      promptPath: PROBE_PATH,
      timeoutMs: PROBE_TIMEOUT_MS,
    })

    if (run.proc.timedOut) return 'пробный запрос к агенту не уложился в лимит'
    if (run.proc.code !== 0) return run.result?.text || run.proc.stderr.trim() || `агент завершился с кодом ${run.proc.code}`
    if (run.parseError) return `агент ответил не JSON-результатом: ${run.parseError}`
    if (run.result?.isError) return `агент не смог выполнить запрос: ${run.result.text.trim()}`
    return undefined
  } finally {
    await sandbox.remove()
    rmSync(dir, { recursive: true, force: true })
  }
}

/** What to do about the failures this check actually runs into. */
export function agentHint(failure: string, provider: BenchConfig['participantProvider']): string {
  if (provider === 'claude') {
    return 'проверьте секрет Anthropic в Docker Sandboxes и доступ к api.anthropic.com'
  }
  if (/api[- ]key|invalid|authentication|not logged in|login/i.test(failure)) {
    return 'проверьте авторизацию Codex в Docker Sandboxes и доступность выбранной модели'
  }
  return 'проверьте `sbx policy ls` и доступ Codex к OpenAI'
}
