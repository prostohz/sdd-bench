export class ValidationError extends Error {
  readonly problems: string[]

  constructor(source: string, problems: string[]) {
    super(`${source}:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    this.name = 'ValidationError'
    this.problems = problems
  }
}

/**
 * Collects every problem found in one descriptor instead of throwing on the
 * first, so a malformed task or participant is reported in full. Nested
 * readers report into the same list under a dotted path.
 */
export class Reader {
  private constructor(
    private readonly source: string,
    private readonly value: unknown,
    private readonly path: string,
    private readonly problems: string[],
  ) {
    if (!isRecord(value)) this.problems.push(`${this.at('')}must be a JSON object`)
  }

  static of(source: string, value: unknown): Reader {
    return new Reader(source, value, '', [])
  }

  private at(key: string): string {
    const full = this.path === '' ? key : `${this.path}.${key}`
    return full === '' ? '' : `${full}: `
  }

  private field(key: string): unknown {
    return isRecord(this.value) ? this.value[key] : undefined
  }

  string(key: string): string {
    const raw = this.field(key)
    if (typeof raw === 'string' && raw.length > 0) return raw
    this.problems.push(`${this.at(key)}expected a non-empty string`)
    return ''
  }

  optionalString(key: string): string | undefined {
    const raw = this.field(key)
    if (raw === undefined || raw === null) return undefined
    if (typeof raw === 'string' && raw.length > 0) return raw
    this.problems.push(`${this.at(key)}expected a non-empty string or null`)
    return undefined
  }

  enum<T extends string>(key: string, allowed: readonly T[]): T {
    const raw = this.field(key)
    if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) return raw as T
    this.problems.push(`${this.at(key)}expected one of ${allowed.join(', ')}`)
    return allowed[0] as T
  }

  stringArray(key: string): string[] {
    const raw = this.field(key)
    if (raw === undefined || raw === null) return []
    if (Array.isArray(raw) && raw.every((item) => typeof item === 'string' && item.length > 0)) {
      return raw as string[]
    }
    this.problems.push(`${this.at(key)}expected an array of non-empty strings`)
    return []
  }

  number(key: string, fallback: number): number {
    const raw = this.field(key)
    if (raw === undefined || raw === null) return fallback
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    this.problems.push(`${this.at(key)}expected a number`)
    return fallback
  }

  stringMap(key: string): Record<string, string> {
    const raw = this.field(key)
    if (raw === undefined || raw === null) return {}
    if (isRecord(raw) && Object.values(raw).every((v) => typeof v === 'string' && v.length > 0)) {
      return raw as Record<string, string>
    }
    this.problems.push(`${this.at(key)}expected an object of non-empty strings`)
    return {}
  }

  object(key: string): Reader | undefined {
    const raw = this.field(key)
    if (raw === undefined || raw === null) return undefined
    const nested = this.path === '' ? key : `${this.path}.${key}`
    if (isRecord(raw)) return new Reader(this.source, raw, nested, this.problems)
    this.problems.push(`${this.at(key)}expected an object or null`)
    return undefined
  }

  problem(message: string): void {
    this.problems.push(message)
  }

  done(): void {
    if (this.problems.length > 0) throw new ValidationError(this.source, this.problems)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
