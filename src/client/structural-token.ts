/** JSON-equivalent change token without copying/escaping long string values. */
export type StructuralToken = readonly string[]

export function structuralToken(value: unknown): StructuralToken {
  const strings: string[] = []
  const shape = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== 'string') return item
    strings.push(item)
    return ''
  })
  // String slots remain strings in the shape; numbers/objects cannot alias them.
  return [shape ?? '', ...strings]
}

export function sameStructuralToken(
  left: string | StructuralToken,
  right: string | StructuralToken,
): boolean {
  if (left === right) return true
  if (typeof left === 'string' || typeof right === 'string' || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}
