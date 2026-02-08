import { readFileSync } from 'node:fs'

const NAMED_EXPORT_RE = /export\s+(?:const|function|let|var)\s+(\w+)/g

export function extractExportNames(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8')
  const names: string[] = []

  let match: RegExpExecArray | null
  while ((match = NAMED_EXPORT_RE.exec(content)) !== null) {
    if (match[1]) {
      names.push(match[1])
    }
  }

  return names
}
