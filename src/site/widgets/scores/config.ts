import type { Metric } from '../../../model/run.js'

export const METRIC_HINTS: Record<Metric, string> = {
  'spec-quality': 'Quality of the specification itself',
  'spec-fit': 'How well the specification covers the task requirements',
  'impl-fit': 'How well the implementation follows the specification',
}
export const NAMES: Record<string, string> = {
  neutral: 'Baseline',
  openspec: 'OpenSpec',
  gsd: 'GSD Core',
  speckit: 'Spec Kit',
  bmad: 'BMad Method',
  canon: 'Canon',
}
export const REPOSITORIES: Record<string, string> = {
  openspec: 'https://github.com/Fission-AI/OpenSpec',
  gsd: 'https://github.com/open-gsd/gsd-core',
  speckit: 'https://github.com/github/spec-kit',
  bmad: 'https://github.com/bmad-code-org/BMAD-METHOD',
  canon: 'https://github.com/prostohz/canon',
}
export const CLASS_NAMES: Record<string, string> = {
  greenfield: 'Greenfield',
  'brownfield-nospec': 'Brownfield · no specification',
  'brownfield-spec': 'Brownfield · current specification',
}
export const TASK_DESCRIPTIONS: Record<string, string> = {
  'ledger-cli': 'Build a standalone CLI to record income and expenses, list transactions, and calculate balances.',
  'tasks-cli': 'Add priorities, sorting, and filtering to an existing task CLI while preserving saved tasks and existing behavior.',
  'tasks-priority-edit': 'Change the priority of an existing task in a CLI with an established specification.',
}
