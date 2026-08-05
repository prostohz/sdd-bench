import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, normalize } from 'node:path'

import type { ProcResult } from '../proc.js'
import type { CreateOptions, ExecOptions, Sandbox, SandboxDriver } from './driver.js'

import { SPEC_STAGING } from './extract.js'

/**
 * Runs the whole pipeline without a sandbox or an API call: the agent and the
 * judges answer with canned output, so the catalog, the artifacts, the score
 * and the report can be exercised for free.
 */
export class DryRunDriver implements SandboxDriver {
  readonly kind = 'dry-run'

  async version(): Promise<string> {
    return 'dry-run'
  }

  async preflight(): Promise<string[]> {
    return ['холостой прогон: агент и судьи не запускаются, оценки выдуманы']
  }

  async create(options: CreateOptions): Promise<Sandbox> {
    return new DrySandbox(options.name, options.workspace)
  }
}

class DrySandbox implements Sandbox {
  private readonly root: string

  constructor(
    readonly name: string,
    workspace: string,
  ) {
    this.root = mkdtempSync(join(tmpdir(), 'sdd-bench-dry-'))
    cpSync(workspace, this.root, { recursive: true })
  }

  async exec(script: string, _options: ExecOptions = {}): Promise<ProcResult> {
    if (script.includes('--json-schema')) return this.result(JSON.stringify(this.verdict(script)))
    if (script.includes('claude -p')) {
      this.writeArtifacts()
      return this.result('Спецификация и реализация готовы.')
    }
    // The extraction step reads real files back, so they have to be there.
    if (script.includes('git bundle create')) this.bundle()
    if (script.includes(SPEC_STAGING)) this.collectSpec()
    return this.result('')
  }

  async allowHosts(): Promise<void> {}

  async copyIn(hostPath: string, sandboxPath: string): Promise<void> {
    const target = join(this.root, sandboxPath.replace(/^\//, ''))
    mkdirSync(dirname(target), { recursive: true })
    cpSync(hostPath, target, { recursive: true })
  }

  async copyOut(sandboxPath: string, hostPath: string): Promise<void> {
    mkdirSync(dirname(hostPath), { recursive: true })
    cpSync(normalize(join(this.root, sandboxPath.replace(/^\//, ''))), hostPath, { recursive: true })
  }

  async repoPath(): Promise<string> {
    return '/'
  }

  async remove(): Promise<void> {
    rmSync(this.root, { recursive: true, force: true })
  }

  private bundle(): void {
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: this.root, stdio: 'ignore' })
    }
    git('add', '--all')
    git('-c', 'user.name=sdd-bench', '-c', 'user.email=bench@localhost', 'commit', '--allow-empty', '-m', 'dry run')
    mkdirSync(join(this.root, 'tmp', 'sdd-bench-out'), { recursive: true })
    git('bundle', 'create', join(this.root, 'tmp', 'sdd-bench-out', 'repo.bundle'), '--all')
  }

  private collectSpec(): void {
    const target = join(this.root, SPEC_STAGING.replace(/^\//, ''))
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    const spec = join(this.root, 'spec')
    if (existsSync(spec)) cpSync(spec, target, { recursive: true })
  }

  private writeArtifacts(): void {
    mkdirSync(join(this.root, 'spec'), { recursive: true })
    writeFileSync(
      join(this.root, 'spec', 'spec.md'),
      `# Спецификация (холостой прогон)\n\nSandbox: ${this.name}\n`,
    )
    writeFileSync(join(this.root, 'IMPLEMENTED.md'), 'Холостой прогон: реализации нет.\n')
  }

  private verdict(script: string): { score: number; rationale: string; evidence: string[] } {
    const metric = /Q|SR|IS/.exec(script.split('rubric-')[1] ?? '')?.[0] ?? 'Q'
    const score = 5 + (hash(`${this.name}:${metric}`) % 41) / 10
    return {
      score: Number(score.toFixed(1)),
      rationale: 'Холостой прогон: оценка выдумана и ничего не значит.',
      evidence: [],
    }
  }

  private result(text: string): ProcResult {
    const seed = hash(this.name)
    const envelope = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_ms: 60_000 + (seed % 600) * 1000,
      duration_api_ms: 50_000 + (seed % 500) * 1000,
      num_turns: 5 + (seed % 20),
      result: text,
      total_cost_usd: Number((0.5 + (seed % 300) / 100).toFixed(2)),
      usage: {
        input_tokens: 10_000 + (seed % 5000),
        output_tokens: 4_000 + (seed % 3000),
        cache_creation_input_tokens: 20_000 + (seed % 9000),
        cache_read_input_tokens: 100_000 + (seed % 50_000),
      },
    }
    return { code: 0, stdout: JSON.stringify(envelope), stderr: '', timedOut: false, durationMs: 1 }
  }
}

function hash(value: string): number {
  let acc = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    acc ^= value.charCodeAt(i)
    acc = Math.imul(acc, 16777619)
  }
  return Math.abs(acc)
}
