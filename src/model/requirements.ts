/** One requirement of the intent, as the task states it once for everyone. */
export interface Requirement {
  id: string
  text: string
}

const LINE = /^[-*]\s+([A-Za-z][A-Za-z0-9_-]*)\.\s+(\S.*)$/

/**
 * The checklist every judge of `spec-fit` rules against. It is written by hand
 * beside the intent and never derived by the judge, so two participants are
 * measured against the same list and not against two readings of one text.
 */
export function parseRequirements(text: string): Requirement[] {
  const found: Requirement[] = []
  for (const line of text.split('\n')) {
    const match = LINE.exec(line.trim())
    if (match) found.push({ id: match[1] as string, text: (match[2] as string).trim() })
  }
  return found
}

/** What is wrong with the list, said all at once. */
export function requirementProblems(requirements: Requirement[]): string[] {
  const problems: string[] = []
  if (requirements.length === 0) {
    problems.push('нет ни одного требования вида "- R1. текст"')
  }
  const seen = new Set<string>()
  for (const requirement of requirements) {
    if (seen.has(requirement.id)) problems.push(`требование "${requirement.id}" названо дважды`)
    seen.add(requirement.id)
  }
  return problems
}
