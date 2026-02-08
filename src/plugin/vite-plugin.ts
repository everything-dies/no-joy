import { resolve } from 'node:path'

import { generateComponentWrapper } from './codegen'
import { scan } from './scanner'

import type { ComponentEntry, ScanResult } from './scanner'
import type { Plugin } from 'vite'

const VIRTUAL_PREFIX = '\0nojoy:component:'

export interface NojoyPluginOptions {
  srcDir?: string
}

export function nojoyPlugin(options: NojoyPluginOptions = {}): Plugin {
  let registry: ScanResult
  let componentMap: Map<string, ComponentEntry>
  let resolvedSrcDir: string

  return {
    name: 'nojoy',
    enforce: 'pre',

    configResolved(config) {
      resolvedSrcDir = options.srcDir
        ? resolve(config.root, options.srcDir)
        : resolve(config.root, 'src')

      registry = scan(resolvedSrcDir)

      componentMap = new Map()
      for (const component of registry.components) {
        componentMap.set(component.dir, component)
      }
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

      return generateComponentWrapper(component)
    },
  }
}
