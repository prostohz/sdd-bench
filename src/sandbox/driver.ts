import type { ProcResult } from '../proc.js'

export interface ExecOptions {
  timeoutMs?: number
  cwd?: string
}

export interface Sandbox {
  readonly name: string
  /** Runs a shell script inside the sandbox. */
  exec(script: string, options?: ExecOptions): Promise<ProcResult>
  /** Permits outbound access to these hosts, for this sandbox only. */
  allowHosts(hosts: string[]): Promise<void>
  /**
   * Copies a file or directory in or out. Both paths must end in the same
   * name: `sbx cp` places the source *inside* the destination directory, so
   * the destination is its parent and the name comes from the source.
   */
  copyIn(hostPath: string, sandboxPath: string): Promise<void>
  copyOut(sandboxPath: string, hostPath: string): Promise<void>
  /** Where the agent's git repository actually lives inside the sandbox. */
  repoPath(): Promise<string>
  remove(): Promise<void>
}

export interface CreateOptions {
  name: string
  workspace: string
  /** `claude` for a participant or a judge, `shell` for a checking sandbox. */
  agent: 'claude' | 'shell'
  /** Work on a private in-sandbox clone, host repository mounted read-only. */
  clone: boolean
  /** Extra host directories mounted read-only. */
  readOnlyMounts?: string[]
}

export interface SandboxDriver {
  readonly kind: string
  version(): Promise<string>
  /** Problems worth telling the user about before a run starts. */
  preflight(): Promise<string[]>
  create(options: CreateOptions): Promise<Sandbox>
}
