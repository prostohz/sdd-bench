import type { Effort, Provider } from '../config.js'
import type { Sandbox } from '../sandbox/driver.js'
import { runClaude, type ClaudeRun } from './claude.js'
import { runCodex, type CodexRun } from './codex.js'

export type AgentRun = ClaudeRun | CodexRun

export interface AgentInvocation {
  model: string
  effort: Effort
  promptPath: string
  jsonSchema?: string
  maxBudgetUsd?: number | undefined
  cwd?: string
  timeoutMs: number
  onStdout?: (chunk: string) => void
}

export function providerHosts(provider: Provider): string[] {
  return provider === 'claude' ? ['api.anthropic.com'] : ['api.openai.com', 'chatgpt.com', 'auth.openai.com']
}

export function runAgent(sandbox: Sandbox, provider: Provider, invocation: AgentInvocation): Promise<AgentRun> {
  return provider === 'claude' ? runClaude(sandbox, invocation) : runCodex(sandbox, invocation)
}
