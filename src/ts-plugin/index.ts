import { dirname } from 'node:path'

import type ts from 'typescript'

import { createTypeInjector } from '../plugin/inject-types'

function init(modules: { typescript: typeof ts }) {
  const tsModule = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    const logger = info.project.projectService.logger
    const injector = createTypeInjector(tsModule)

    function log(msg: string) {
      logger.info(`[nojoy] ${msg}`)
    }

    // Intercept getScriptSnapshot to inject types
    const originalGetScriptSnapshot =
      info.languageServiceHost.getScriptSnapshot.bind(info.languageServiceHost)

    info.languageServiceHost.getScriptSnapshot = (
      fileName: string
    ): ts.IScriptSnapshot | undefined => {
      const snapshot = originalGetScriptSnapshot(fileName)
      if (!snapshot) return snapshot
      if (!injector.isComponentView(fileName)) return snapshot

      const text = snapshot.getText(0, snapshot.getLength())
      const augmented = injector.injectTypes(fileName, text)

      if (augmented !== text) {
        log(`Injected types into ${fileName}`)
        return tsModule.ScriptSnapshot.fromString(augmented)
      }

      return snapshot
    }

    // Bust script version cache when concern files change
    const originalGetScriptVersion =
      info.languageServiceHost.getScriptVersion?.bind(info.languageServiceHost)
    if (originalGetScriptVersion) {
      info.languageServiceHost.getScriptVersion = (
        fileName: string
      ): string => {
        const version = originalGetScriptVersion(fileName)
        if (!injector.isComponentView(fileName)) return version

        const dir = dirname(fileName)
        const parts = [version]
        const asyncPath = injector.findConcern(dir, 'async')
        const i18nPath = injector.findConcern(dir, 'i18n')
        if (asyncPath) parts.push(originalGetScriptVersion(asyncPath))
        if (i18nPath) parts.push(originalGetScriptVersion(i18nPath))
        return parts.join(':')
      }
    }

    log('Plugin initialized')
    return info.languageService
  }

  return { create }
}

export default init
