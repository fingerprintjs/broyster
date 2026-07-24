export function unique<Value>(values: readonly Value[]): Value[] {
  return [...new Set(values)]
}

export function uniqueSorted(values: readonly string[]): string[] {
  return unique(values.filter(Boolean)).sort((left, right) => left.localeCompare(right))
}

export function compareById<Value extends { id: string }>(left: Value, right: Value): number {
  return left.id.localeCompare(right.id)
}
