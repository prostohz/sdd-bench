import { spawn } from 'node:child_process'

export interface ProcResult {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
}

export interface ProcOptions {
  timeoutMs?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
  input?: string
}

export class ProcError extends Error {
  constructor(
    readonly command: string,
    readonly result: ProcResult,
  ) {
    super(
      `${command} exited with ${result.code}${result.timedOut ? ' (timed out)' : ''}` +
        (result.stderr.trim() ? `\n${result.stderr.trim()}` : ''),
    )
    this.name = 'ProcError'
  }
}

export function run(cmd: string, args: string[], options: ProcOptions = {}): Promise<ProcResult> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
            setTimeout(() => child.kill('SIGKILL'), 5000).unref()
          }, options.timeoutMs)

    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr, timedOut, durationMs: Date.now() - startedAt })
    })

    if (options.input !== undefined) child.stdin.write(options.input)
    child.stdin.end()
  })
}

export async function runOrThrow(cmd: string, args: string[], options: ProcOptions = {}): Promise<ProcResult> {
  const result = await run(cmd, args, options)
  if (result.code !== 0) throw new ProcError([cmd, ...args].join(' '), result)
  return result
}
