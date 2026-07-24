export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
