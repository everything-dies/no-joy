type NestedMessages = { [key: string]: string | NestedMessages }
type FlatMessages = Record<string, string>

export function flatten(
  obj: NestedMessages,
  prefix = '',
  separator = '/'
): FlatMessages {
  const result: FlatMessages = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const path = prefix ? `${prefix}${separator}${key}` : key
    if (typeof value === 'string') {
      result[path] = value
    } else if (value !== null && typeof value === 'object') {
      Object.assign(result, flatten(value, path, separator))
    }
  }
  return result
}

export function unflatten(flat: FlatMessages, separator = '/'): NestedMessages {
  const result: NestedMessages = {}
  for (const key of Object.keys(flat)) {
    const parts = key.split(separator)
    let current: NestedMessages = result
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!
      if (!(part in current) || typeof current[part] === 'string') {
        current[part] = {}
      }
      current = current[part] as NestedMessages
    }
    current[parts[parts.length - 1]!] = flat[key]!
  }
  return result
}
