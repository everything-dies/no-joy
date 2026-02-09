import { watch } from 'chokidar'
import { join, resolve } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

import { generateComponentWrapper, generatePrefix } from './codegen'
import { scan } from './scanner'
import type { ComponentEntry, ScanResult } from './scanner'

const VIRTUAL_PREFIX = '\0nojoy:component:'

export interface NojoyPluginOptions {
  srcDir?: string
}

function buildComponentMap(registry: ScanResult): Map<string, ComponentEntry> {
  const map = new Map<string, ComponentEntry>()
  for (const component of registry.components) {
    map.set(component.dir, component)
  }
  return map
}

export function nojoyPlugin(options: NojoyPluginOptions = {}): Plugin {
  let registry: ScanResult
  let componentMap: Map<string, ComponentEntry>
  let resolvedSrcDir: string
  let resolvedRoot: string
  let prefix: string

  function rescan(): void {
    registry = scan(resolvedSrcDir)
    componentMap = buildComponentMap(registry)
  }

  function invalidateVirtualModules(server: ViteDevServer): void {
    for (const dir of componentMap.keys()) {
      const id = VIRTUAL_PREFIX + dir
      const mod = server.moduleGraph.getModuleById(id)
      if (mod) {
        server.moduleGraph.invalidateModule(mod)
      }
    }
  }

  return {
    name: 'nojoy',
    enforce: 'pre',

    configResolved(config) {
      resolvedRoot = config.root
      resolvedSrcDir = options.srcDir
        ? resolve(config.root, options.srcDir)
        : resolve(config.root, 'src')

      rescan()
      prefix = generatePrefix()
    },

    configureServer(server) {
      const watchDirs = [
        join(resolvedSrcDir, 'components'),
        join(resolvedSrcDir, 'services'),
        join(resolvedSrcDir, 'clients'),
      ]

      const watcher = watch(watchDirs, {
        ignoreInitial: true,
        ignorePermissionErrors: true,
      })

      let debounceTimer: ReturnType<typeof setTimeout> | undefined

      const scheduleRescan = () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          const previousDirs = new Set(componentMap.keys())
          rescan()
          const currentDirs = new Set(componentMap.keys())

          // Invalidate removed components
          for (const dir of previousDirs) {
            const id = VIRTUAL_PREFIX + dir
            const mod = server.moduleGraph.getModuleById(id)
            if (mod) {
              server.moduleGraph.invalidateModule(mod)
            }
          }

          // Invalidate current components (new or updated)
          invalidateVirtualModules(server)

          // Trigger full reload so importers pick up new/removed resolutions
          const hasChanges =
            previousDirs.size !== currentDirs.size ||
            [...currentDirs].some((d) => !previousDirs.has(d)) ||
            [...previousDirs].some((d) => !currentDirs.has(d))

          if (hasChanges) {
            server.ws.send({ type: 'full-reload' })
          }
        }, 100)
      }

      watcher.on('add', scheduleRescan)
      watcher.on('unlink', scheduleRescan)
      watcher.on('addDir', scheduleRescan)
      watcher.on('unlinkDir', scheduleRescan)

      // Clean up watcher when server closes
      server.httpServer?.on('close', () => {
        watcher.close()
      })
    },

    resolveId(source, importer) {
      if (!importer) return undefined

      // Resolve the source to an absolute path
      let resolved: string
      if (source.startsWith('.') || source.startsWith('/')) {
        const importerDir = resolve(importer, '..')
        resolved = resolve(importerDir, source)
      } else {
        return undefined
      }

      // Check if this resolves to a component directory
      const component = componentMap.get(resolved)
      if (component) {
        return VIRTUAL_PREFIX + resolved
      }

      return undefined
    },

    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return undefined

      const componentDir = id.slice(VIRTUAL_PREFIX.length)
      const component = componentMap.get(componentDir)

      if (!component) return undefined

      return generateComponentWrapper(component, prefix, resolvedRoot)
    },
  }
}
