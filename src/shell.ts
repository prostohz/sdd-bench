/** Wraps a value so a shell inside a sandbox reads it as one literal word. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}
