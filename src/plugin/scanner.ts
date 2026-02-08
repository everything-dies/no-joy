import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export interface ComponentEntry {
  name: string
  dir: string
  viewPath: string
  concerns: Record<string, string>
}

export interface ClientEntry {
  name: string
  entryPath: string
}

export interface ServiceEntry {
  namespace: string
  entryPath: string
}

export interface ScanResult {
  clients: ClientEntry[]
  services: ServiceEntry[]
  components: ComponentEntry[]
}

const CONCERN_FILES = new Set(['async', 'placeholder', 'error'])

const VIEW_EXTENSIONS = ['.tsx', '.jsx']
const ENTRY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

function findFile(dir: string, baseName: string, extensions: string[]): string | undefined {
  for (const ext of extensions) {
    const filePath = join(dir, baseName + ext)
    if (existsSync(filePath)) {
      return filePath
    }
  }
  return undefined
}

function scanClients(clientsDir: string): ClientEntry[] {
  if (!existsSync(clientsDir)) return []

  const entries: ClientEntry[] = []

  for (const name of readdirSync(clientsDir)) {
    const dirPath = join(clientsDir, name)
    if (!statSync(dirPath).isDirectory()) continue

    const entryPath = findFile(dirPath, 'index', ENTRY_EXTENSIONS)
    if (entryPath) {
      entries.push({ name, entryPath })
    }
  }

  return entries
}

function scanServices(
  servicesDir: string,
  basePath: string = servicesDir
): ServiceEntry[] {
  if (!existsSync(servicesDir)) return []

  const entries: ServiceEntry[] = []

  for (const name of readdirSync(servicesDir)) {
    const fullPath = join(servicesDir, name)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      // Check for index file in directory
      const entryPath = findFile(fullPath, 'index', ENTRY_EXTENSIONS)
      if (entryPath) {
        const namespace = relative(basePath, fullPath).split(sep).join('/')
        entries.push({ namespace, entryPath })
      }

      // Recurse into subdirectories
      entries.push(...scanServices(fullPath, basePath))
    } else if (stat.isFile()) {
      // Named file (e.g., services/market/live.ts)
      const ext = ENTRY_EXTENSIONS.find((e) => name.endsWith(e))
      if (ext && name !== 'index' + ext) {
        const baseName = name.slice(0, -ext.length)
        const dirNamespace = relative(basePath, servicesDir).split(sep).join('/')
        const namespace = dirNamespace ? `${dirNamespace}/${baseName}` : baseName
        entries.push({ namespace, entryPath: fullPath })
      }
    }
  }

  return entries
}

function scanComponents(
  componentsDir: string,
  basePath: string = componentsDir
): ComponentEntry[] {
  if (!existsSync(componentsDir)) return []

  const entries: ComponentEntry[] = []

  for (const name of readdirSync(componentsDir)) {
    const dirPath = join(componentsDir, name)
    if (!statSync(dirPath).isDirectory()) continue

    // Check for view file
    const viewPath = findFile(dirPath, 'index', VIEW_EXTENSIONS)
    if (viewPath) {
      // Scan for concern files
      const concerns: Record<string, string> = {}
      for (const concern of CONCERN_FILES) {
        const concernPath = findFile(dirPath, concern, ENTRY_EXTENSIONS)
        if (concernPath) {
          concerns[concern] = concernPath
        } else {
          // Check for directory pattern (e.g., error/index.tsx)
          const subDir = join(dirPath, concern)
          if (existsSync(subDir) && statSync(subDir).isDirectory()) {
            const indexPath = findFile(subDir, 'index', ENTRY_EXTENSIONS)
            if (indexPath) {
              concerns[concern] = indexPath
            }
          }
        }
      }

      // Only register as a framework component if it has concern files
      if (Object.keys(concerns).length > 0) {
        const componentName = relative(basePath, dirPath).split(sep).join('/')
        entries.push({
          name: componentName,
          dir: dirPath,
          viewPath,
          concerns,
        })
      }
    }

    // Recurse into subdirectories
    entries.push(...scanComponents(dirPath, basePath))
  }

  return entries
}

export function scan(srcDir: string): ScanResult {
  return {
    clients: scanClients(join(srcDir, 'clients')),
    services: scanServices(join(srcDir, 'services')),
    components: scanComponents(join(srcDir, 'components')),
  }
}
