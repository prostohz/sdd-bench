import { mkdirSync, rmSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { ProcError, run, runOrThrow, type ProcResult } from '../proc.js'
import { shellQuote } from '../shell.js'
import type { CreateOptions, ExecOptions, Sandbox, SandboxDriver } from './driver.js'

const CLI = 'sbx'

/** Isolation the methodology asks for, absent from older CLI versions. */
const OPTIONAL_FLAGS = ['--clone', '--no-share-skills'] as const

/**
 * Docker Sandboxes through the `sbx` CLI. Flags the methodology relies on —
 * `--clone` and `--no-share-skills` — are feature-detected, because the older
 * `docker sandbox` plugin does not have them.
 */
export class SbxDriver implements SandboxDriver {
  readonly kind = 'sbx'
  private flags: Set<string> | undefined

  async version(): Promise<string> {
    const result = await run(CLI, ['version'])
    if (result.code !== 0) throw new Error(missingCliMessage(result))
    return result.stdout.trim().split('\n')[0] ?? 'unknown'
  }

  async preflight(): Promise<string[]> {
    const warnings: string[] = []
    const flags = await this.supportedFlags()

    for (const flag of OPTIONAL_FLAGS) {
      if (!flags.has(flag)) {
        warnings.push(
          `sbx create не знает ${flag}: изоляция запусков слабее описанной в METHODOLOGY.md. ` +
            'Обновите CLI: brew install docker/tap/sbx',
        )
      }
    }

    const policy = await run(CLI, ['policy', 'ls'])
    if (policy.code === 0 && /\*\*/.test(policy.stdout)) {
      warnings.push(
        'активная сетевая политика содержит правило "**": сеть в sandbox открыта. ' +
          'Ожидается deny-by-default — см. `sbx policy init deny-all`',
      )
    }

    return warnings
  }

  async create(options: CreateOptions): Promise<Sandbox> {
    const flags = await this.supportedFlags()
    const args = ['create', '--quiet', '--name', options.name]
    if (options.clone && flags.has('--clone')) args.push('--clone')
    if (flags.has('--no-share-skills')) args.push('--no-share-skills')
    args.push(options.agent, options.workspace)
    for (const mount of options.readOnlyMounts ?? []) args.push(`${mount}:ro`)

    await runOrThrow(CLI, args)
    return new SbxSandbox(options.name)
  }

  /**
   * `--no-share-skills` is experimental and absent from `--help`, so the help
   * text cannot be trusted. Parsing happens before the missing-argument check,
   * which makes an argument-less `sbx create <flag>` a cheap probe.
   */
  private async supportedFlags(): Promise<Set<string>> {
    if (this.flags) return this.flags

    const supported = new Set<string>()
    for (const flag of OPTIONAL_FLAGS) {
      const probe = await run(CLI, ['create', flag])
      const said = `${probe.stdout}\n${probe.stderr}`
      if (/executable file not found|command not found|no such file/i.test(said)) {
        throw new Error(missingCliMessage(probe))
      }
      if (!said.includes(`unknown flag: ${flag}`)) supported.add(flag)
    }

    this.flags = supported
    return this.flags
  }
}

class SbxSandbox implements Sandbox {
  private cachedRepoPath: string | undefined

  constructor(readonly name: string) {}

  async exec(script: string, options: ExecOptions = {}): Promise<ProcResult> {
    const args = ['exec']
    if (options.cwd) args.push('--workdir', options.cwd)
    args.push(this.name, 'bash', '-lc', script)
    return run(CLI, args, options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
  }

  /**
   * A task and a participant may both need the same host, and `sbx` rejects
   * the whole batch over one repeated rule. Repetition is not a conflict, so
   * an already-covered host is not an error here either.
   */
  async allowHosts(hosts: string[]): Promise<void> {
    const wanted = uniqueHosts(hosts)
    if (wanted.length === 0) return

    const batch = await run(CLI, ['policy', 'allow', 'network', '--sandbox', this.name, wanted.join(',')])
    if (batch.code === 0) return

    for (const host of wanted) {
      const single = await run(CLI, ['policy', 'allow', 'network', '--sandbox', this.name, host])
      if (single.code !== 0 && !isAlreadyAllowed(single)) {
        throw new ProcError(`sbx policy allow network ${host}`, single)
      }
    }
  }

  async copyIn(hostPath: string, sandboxPath: string): Promise<void> {
    sameName(hostPath, sandboxPath)
    await this.exec(`mkdir -p ${shellQuote(posixDirname(sandboxPath))}`)
    await runOrThrow(CLI, ['cp', hostPath, `${this.name}:${posixDirname(sandboxPath)}`])
  }

  async copyOut(sandboxPath: string, hostPath: string): Promise<void> {
    sameName(hostPath, sandboxPath)
    mkdirSync(dirname(hostPath), { recursive: true })
    rmSync(hostPath, { recursive: true, force: true })
    await runOrThrow(CLI, ['cp', `${this.name}:${sandboxPath}`, dirname(hostPath)])
  }

  async repoPath(): Promise<string> {
    if (this.cachedRepoPath) return this.cachedRepoPath
    const result = await this.exec('git rev-parse --show-toplevel 2>/dev/null || pwd')
    const path = result.stdout.trim().split('\n').pop()?.trim()
    if (!path) throw new Error(`sandbox ${this.name}: не удалось определить каталог репозитория`)
    this.cachedRepoPath = path
    return path
  }

  async remove(): Promise<void> {
    await run(CLI, ['rm', '--force', this.name])
  }
}

/** Same host asked for twice is one rule, in the order first asked. */
export function uniqueHosts(hosts: string[]): string[] {
  return [...new Set(hosts.map((host) => host.trim()).filter((host) => host !== ''))]
}

function isAlreadyAllowed(result: ProcResult): boolean {
  return /duplicate rule|already covered/i.test(`${result.stdout}\n${result.stderr}`)
}

function sameName(hostPath: string, sandboxPath: string): void {
  if (basename(hostPath) !== posixBasename(sandboxPath)) {
    throw new Error(`копирование требует одинакового имени: "${hostPath}" и "${sandboxPath}"`)
  }
}

function posixDirname(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? '/' : path.slice(0, cut)
}

function posixBasename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function missingCliMessage(result: ProcResult): string {
  return (
    'не удалось выполнить `sbx`. Установите CLI Docker Sandboxes:\n' +
    '  brew trust docker/tap && brew install docker/tap/sbx && sbx login\n' +
    'Плагин `docker sandbox` устарел и не поддерживает --clone/--no-share-skills.\n' +
    result.stderr.trim()
  )
}
