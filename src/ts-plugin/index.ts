import { dirname, join } from 'node:path'

import type ts from 'typescript'

const ENTRY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
const VIEW_BASENAMES = new Set(['index.tsx', 'index.jsx'])

function init(modules: { typescript: typeof ts }) {
  const tsModule = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    const logger = info.project.projectService.logger

    function log(msg: string) {
      logger.info(`[nojoy] ${msg}`)
    }

    function fileExists(path: string): boolean {
      return tsModule.sys.fileExists(path)
    }

    function findConcern(dir: string, name: string): string | undefined {
      for (const ext of ENTRY_EXTENSIONS) {
        const path = join(dir, name + ext)
        if (fileExists(path)) return path
      }
      // Subdirectory pattern (e.g., error/index.tsx)
      const subDir = join(dir, name)
      for (const ext of ENTRY_EXTENSIONS) {
        const path = join(subDir, 'index' + ext)
        if (fileExists(path)) return path
      }
      return undefined
    }

    function isComponentView(fileName: string): boolean {
      const base = fileName.replace(/\\/g, '/').split('/').pop()
      if (!base || !VIEW_BASENAMES.has(base)) return false

      const dir = dirname(fileName)
      return !!findConcern(dir, 'async') || !!findConcern(dir, 'i18n')
    }

    function hasExportModifier(node: ts.Node): boolean {
      if (!tsModule.canHaveModifiers(node)) return false
      const mods = tsModule.getModifiers(node)
      return (
        mods?.some((m) => m.kind === tsModule.SyntaxKind.ExportKeyword) ?? false
      )
    }

    function extractAsyncExports(fileName: string): string[] {
      const content = tsModule.sys.readFile(fileName)
      if (!content) return []

      const sf = tsModule.createSourceFile(
        fileName,
        content,
        tsModule.ScriptTarget.Latest,
        true
      )
      const exports: string[] = []

      tsModule.forEachChild(sf, (node) => {
        if (tsModule.isVariableStatement(node) && hasExportModifier(node)) {
          for (const decl of node.declarationList.declarations) {
            if (tsModule.isIdentifier(decl.name)) {
              exports.push(decl.name.text)
            }
          }
        }
        if (
          tsModule.isFunctionDeclaration(node) &&
          hasExportModifier(node) &&
          node.name
        ) {
          exports.push(node.name.text)
        }
        if (
          tsModule.isExportDeclaration(node) &&
          node.exportClause &&
          tsModule.isNamedExports(node.exportClause)
        ) {
          for (const spec of node.exportClause.elements) {
            exports.push(spec.name.text)
          }
        }
      })

      return exports
    }

    function buildTypeAnnotation(dir: string): string | undefined {
      const asyncPath = findConcern(dir, 'async')
      const i18nPath = findConcern(dir, 'i18n')

      if (!asyncPath && !i18nPath) return undefined

      const props: string[] = []

      if (asyncPath) {
        const exports = extractAsyncExports(asyncPath)
        for (const name of exports) {
          props.push(
            `${name}: import('nojoy/runtime').AsyncHandler<` +
              `Parameters<ReturnType<typeof import('./async').${name}>>, ` +
              `Awaited<ReturnType<ReturnType<typeof import('./async').${name}>>>>`
          )
        }
      }

      if (i18nPath) {
        props.push(`i18n: ReturnType<typeof import('./i18n').default>`)
      }

      if (props.length === 0) return undefined

      return '{ ' + props.join('; ') + ' }'
    }

    function findInjectionPoint(text: string, fileName: string): number {
      const sf = tsModule.createSourceFile(
        fileName,
        text,
        tsModule.ScriptTarget.Latest,
        true
      )
      let point = -1

      tsModule.forEachChild(sf, (node) => {
        // export default (...) => ... OR export default function(...) { ... }
        if (tsModule.isExportAssignment(node) && !node.isExportEquals) {
          const expr = node.expression
          let fn: ts.SignatureDeclarationBase | undefined
          if (tsModule.isArrowFunction(expr)) fn = expr
          if (tsModule.isFunctionExpression(expr)) fn = expr

          if (fn && fn.parameters.length > 0) {
            const param = fn.parameters[0]!
            if (!param.type) {
              point = param.name.end
            }
          }
        }

        // export default function Name(...) { ... } (FunctionDeclaration with default modifier)
        if (
          tsModule.isFunctionDeclaration(node) &&
          hasExportModifier(node) &&
          tsModule
            .getModifiers(node)
            ?.some((m) => m.kind === tsModule.SyntaxKind.DefaultKeyword)
        ) {
          if (node.parameters.length > 0) {
            const param = node.parameters[0]!
            if (!param.type) {
              point = param.name.end
            }
          }
        }
      })

      return point
    }

    // Intercept getScriptSnapshot to inject types
    const originalGetScriptSnapshot =
      info.languageServiceHost.getScriptSnapshot.bind(info.languageServiceHost)

    info.languageServiceHost.getScriptSnapshot = (
      fileName: string
    ): ts.IScriptSnapshot | undefined => {
      const snapshot = originalGetScriptSnapshot(fileName)
      if (!snapshot) return snapshot
      if (!isComponentView(fileName)) return snapshot

      const dir = dirname(fileName)
      const typeAnnotation = buildTypeAnnotation(dir)
      if (!typeAnnotation) return snapshot

      const text = snapshot.getText(0, snapshot.getLength())
      const point = findInjectionPoint(text, fileName)
      if (point === -1) return snapshot

      const augmented =
        text.slice(0, point) + ': ' + typeAnnotation + text.slice(point)

      log(`Injected types into ${fileName}`)
      return tsModule.ScriptSnapshot.fromString(augmented)
    }

    // Bust script version cache when concern files change
    const originalGetScriptVersion =
      info.languageServiceHost.getScriptVersion?.bind(info.languageServiceHost)
    if (originalGetScriptVersion) {
      info.languageServiceHost.getScriptVersion = (
        fileName: string
      ): string => {
        const version = originalGetScriptVersion(fileName)
        if (!isComponentView(fileName)) return version

        const dir = dirname(fileName)
        const parts = [version]
        const asyncPath = findConcern(dir, 'async')
        const i18nPath = findConcern(dir, 'i18n')
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
