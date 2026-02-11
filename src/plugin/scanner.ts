import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export interface RouteEntry {
  segment: string
  path: string
  dir: string
  viewPath: string | undefined
  asyncPath: string | undefined
  metaPath: string | undefined
  children: RouteEntry[]
}

export interface ComponentEntry {
  name: string
  dir: string
  viewPath: string
  concerns: Record<string, string>
  skins: Record<string, string>
  routes: RouteEntry[]
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

const CONCERN_FILES = new Set(['async', 'placeholder', 'error', 'i18n'])
const SKIN_EXTENSIONS = ['.ts', '.js']

const VIEW_EXTENSIONS = ['.tsx', '.jsx']
const ENTRY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

function findFile(
  dir: string,
  baseName: string,
  extensions: string[]
): string | undefined {
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
        const dirNamespace = relative(basePath, servicesDir)
          .split(sep)
          .join('/')
        const namespace = dirNamespace
          ? `${dirNamespace}/${baseName}`
          : baseName
        entries.push({ namespace, entryPath: fullPath })
      }
    }
  }

  return entries
}

function scanSkins(componentDir: string): Record<string, string> {
  const skinsDir = join(componentDir, 'skins')
  if (!existsSync(skinsDir) || !statSync(skinsDir).isDirectory()) return {}

  const skins: Record<string, string> = {}
  for (const file of readdirSync(skinsDir)) {
    const ext = SKIN_EXTENSIONS.find((e) => file.endsWith(e))
    if (ext) {
      const skinName = file.slice(0, -ext.length)
      if (skinName !== 'index') {
        skins[skinName] = join(skinsDir, file)
      }
    }
  }
  return skins
}

function isRouteDir(name: string): boolean {
  return name.startsWith('[') && name.endsWith(']')
}

export function resolveRoutePath(segment: string): string {
  if (segment === '...') return '*'
  if (segment.startsWith('@')) {
    const param = segment.slice(1)
    return `:${param}`
  }
  return segment
}

function scanRoutes(routesDir: string): RouteEntry[] {
  if (!existsSync(routesDir) || !statSync(routesDir).isDirectory()) return []

  const entries: RouteEntry[] = []

  for (const name of readdirSync(routesDir)) {
    if (!isRouteDir(name)) continue
    const dirPath = join(routesDir, name)
    if (!statSync(dirPath).isDirectory()) continue

    const segment = name.slice(1, -1)
    const path = resolveRoutePath(segment)
    const viewPath = findFile(dirPath, 'index', VIEW_EXTENSIONS)
    const asyncPath = findFile(dirPath, 'async', ENTRY_EXTENSIONS)
    const metaPath = findFile(dirPath, 'meta', ENTRY_EXTENSIONS)
    const children = scanRoutes(dirPath)

    entries.push({
      segment,
      path,
      dir: dirPath,
      viewPath,
      asyncPath,
      metaPath,
      children,
    })
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
    // Skip bracketed directories (route directories)
    if (isRouteDir(name)) continue
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

      // Scan for skins directory
      const skins = scanSkins(dirPath)

      // Scan for routes directory
      const routes = scanRoutes(join(dirPath, '[routes]'))

      // Only register as a framework component if it has concern files, skins, or routes
      if (
        Object.keys(concerns).length > 0 ||
        Object.keys(skins).length > 0 ||
        routes.length > 0
      ) {
        const componentName = relative(basePath, dirPath).split(sep).join('/')
        entries.push({
          name: componentName,
          dir: dirPath,
          viewPath,
          concerns,
          skins,
          routes,
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
