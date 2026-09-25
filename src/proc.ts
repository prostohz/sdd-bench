import { spawn } from 'node:child_process'

export interface ProcResult {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
  /** Calendar time from start to finish, host sleep included. */
  durationMs: number
  /**
   * Time the command actually had the machine, sleep excluded. Elapsed is
   * accumulated in short ticks: a jump between two ticks larger than the tick
   * itself can only be the host suspending, and the command was not running
   * through it. The timeout is spent from this, not from the calendar.
   */
  activeMs: number
}

export interface ProcOptions {
  timeoutMs?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
  input?: string
  /** Called with output as it arrives, for a command worth watching live. */
  onStdout?: (chunk: string) => void
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

/** Short enough that a real gap is unmistakable, long enough to cost nothing. */
const TICK_MS = 2000

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
      options.onStdout?.(chunk)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    let activeMs = 0
    let lastTick = Date.now()
    const tick = (): void => {
      const now = Date.now()
      const delta = now - lastTick
      lastTick = now
      // A gap far past the tick is the host having slept; the command did not
      // run through it, so it is not charged for it.
      if (delta <= TICK_MS * 2) activeMs += delta
      if (options.timeoutMs !== undefined && options.timeoutMs > 0 && activeMs >= options.timeoutMs) {
        timedOut = true
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000).unref()
      }
    }
    const timer = setInterval(tick, TICK_MS)

    child.on('error', (error) => {
      clearInterval(timer)
      reject(error)
    })

    child.on('close', (code) => {
      tick()
      clearInterval(timer)
      resolve({
        code: code ?? -1,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
        activeMs,
      })
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
