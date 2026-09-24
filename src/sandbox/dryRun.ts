import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, normalize } from 'node:path'

import { parseRequirements } from '../model/requirements.js'
import { COVERAGE_RULINGS, IMPL_RULINGS, QUALITY_AXES, SEVERITIES } from '../model/run.js'
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

  async exec(script: string, options: ExecOptions = {}): Promise<ProcResult> {
    if (script.includes('claude -p')) {
      const judge = script.includes('--json-schema')
      if (!judge) this.writeArtifacts()
      const done = this.claudeResult(judge ? JSON.stringify(this.verdict(script)) : 'Спецификация и реализация готовы.')
      if (options.onStdout) options.onStdout(`${done.stdout}\n`)
      return done
    }
    if (script.includes('codex exec')) {
      const judge = script.includes('--output-schema')
      if (!judge) this.writeArtifacts()
      const done = this.result(judge ? JSON.stringify(this.verdict(script)) : 'Спецификация и реализация готовы.')
      if (options.onStdout) options.onStdout(done.stdout)
      return done
    }
    // The extraction step reads real files back, so they have to be there.
    if (script.includes('git bundle create')) this.bundle()
    if (script.includes(SPEC_STAGING)) this.collectSpec()
    return this.plain(script.includes('codex --version') ? 'codex-cli dry-run\n' : script.includes('claude --version') ? 'claude dry-run\n' : '')
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

  /** Rulings, not a score — the stub answers in the shape a judge answers in. */
  private verdict(script: string): Record<string, unknown> {
    const metric = /spec-quality|spec-fit|impl-fit/.exec(script.split('rubric-')[1] ?? '')?.[0] ?? 'spec-quality'
    const rationale = 'Холостой прогон: решения выдуманы и ничего не значат.'
    const pick = <T>(values: readonly T[], seed: string): T =>
      values[hash(`${this.name}:${seed}`) % values.length] as T

    if (metric === 'spec-quality') {
      return {
        defects: QUALITY_AXES.filter((axis) => hash(`${this.name}:${axis}`) % 3 === 0).map((axis) => ({
          axis,
          what: 'выдуманный дефект',
          severity: pick(SEVERITIES, axis),
          where: 'spec/spec.md:1',
          note: '',
        })),
        rationale,
      }
    }

    if (metric === 'spec-fit') {
      const checklist = join(this.root, 'requirements.md')
      const requirements = existsSync(checklist) ? parseRequirements(readFileSync(checklist, 'utf8')) : []
      return {
        requirements: requirements.map((requirement) => ({
          id: requirement.id,
          ruling: pick(COVERAGE_RULINGS, requirement.id),
          where: 'spec/spec.md:1',
          note: '',
        })),
        additions: [],
        rationale,
      }
    }

    return {
      requirements: Array.from({ length: 8 }, (_, index) => ({
        statement: `выдуманное требование ${index + 1}`,
        ruling: pick(IMPL_RULINGS, `impl-${index}`),
        where: 'repo/ledger:1',
        note: '',
      })),
      contradictions: [],
      checks: ['./ledger balance'],
      rationale,
    }
  }

  private result(text: string): ProcResult {
    const seed = hash(this.name)
    const durationMs = 60_000 + (seed % 600) * 1000
    const events = [
      { type: 'thread.started', thread_id: this.name },
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'message', type: 'agent_message', text } },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 10_000 + (seed % 5000),
          output_tokens: 4_000 + (seed % 3000),
          cached_input_tokens: 5000 + (seed % 3000),
        },
      },
    ]
    return {
      code: 0,
      stdout: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
      stderr: '',
      timedOut: false,
      durationMs,
      activeMs: durationMs,
    }
  }

  private claudeResult(text: string): ProcResult {
    const seed = hash(this.name)
    const durationMs = 60_000 + (seed % 600) * 1000
    return {
      code: 0,
      stdout: JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: durationMs,
        num_turns: 5 + (seed % 20),
        result: text,
        total_cost_usd: Number((0.5 + (seed % 300) / 100).toFixed(2)),
        usage: {
          input_tokens: 10_000 + (seed % 5000),
          output_tokens: 4_000 + (seed % 3000),
          cache_creation_input_tokens: 20_000 + (seed % 9000),
          cache_read_input_tokens: 100_000 + (seed % 50_000),
        },
      }),
      stderr: '',
      timedOut: false,
      durationMs,
      activeMs: durationMs,
    }
  }

  private plain(stdout: string): ProcResult {
    return { code: 0, stdout, stderr: '', timedOut: false, durationMs: 1, activeMs: 1 }
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
