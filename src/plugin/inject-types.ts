import { dirname, join } from 'node:path'
import type ts from 'typescript'

const ENTRY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
const VIEW_BASENAMES = new Set(['index.tsx', 'index.jsx'])

export interface TypeInjector {
  isViewFile(fileName: string): boolean
  isComponentView(fileName: string): boolean
  findConcern(dir: string, name: string): string | undefined
  buildTypeAnnotation(dir: string): string | undefined
  findInjectionPoint(text: string, fileName: string): number
  injectTypes(fileName: string, text: string): string
}

export function createTypeInjector(tsModule: typeof ts): TypeInjector {
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

  function isViewFile(fileName: string): boolean {
    if (fileName.includes('node_modules')) return false
    const base = fileName.replace(/\\/g, '/').split('/').pop()
    return !!base && VIEW_BASENAMES.has(base)
  }

  function hasRoutesDir(dir: string): boolean {
    const routesDir = join(dir, '[routes]')
    return tsModule.sys.directoryExists(routesDir)
  }

  function isInsideRoutesDir(dir: string): boolean {
    const normalized = dir.replace(/\\/g, '/')
    return normalized.includes('/[routes]/')
  }

  function isComponentView(fileName: string): boolean {
    const base = fileName.replace(/\\/g, '/').split('/').pop()
    if (!base || !VIEW_BASENAMES.has(base)) return false

    const dir = dirname(fileName)
    return (
      !!findConcern(dir, 'async') ||
      !!findConcern(dir, 'i18n') ||
      hasRoutesDir(dir) ||
      isInsideRoutesDir(dir)
    )
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
    const hasRoutes = hasRoutesDir(dir)
    const isRouteView = isInsideRoutesDir(dir)

    if (!asyncPath && !i18nPath && !hasRoutes && !isRouteView) return undefined

    const props: string[] = []

    if (asyncPath && isRouteView) {
      // Route view: async.ts default export is a loader factory
      // Inject as `load` prop derived from the actual default export
      props.push(
        `load: import('nojoy/runtime').AsyncHandler<` +
          `[Record<string, string | undefined>], ` +
          `Awaited<ReturnType<ReturnType<typeof import('./async').default>>>>`
      )
    } else if (asyncPath) {
      // Component view: named exports → individual handler props
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

    if (hasRoutes) {
      props.push(`routes?: import('react').ReactElement`)
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

  function injectTypes(fileName: string, text: string): string {
    if (!isComponentView(fileName)) return text

    const dir = dirname(fileName)
    const typeAnnotation = buildTypeAnnotation(dir)
    if (!typeAnnotation) return text

    const point = findInjectionPoint(text, fileName)
    if (point === -1) return text

    return text.slice(0, point) + ': ' + typeAnnotation + text.slice(point)
  }

  return {
    isViewFile,
    isComponentView,
    findConcern,
    buildTypeAnnotation,
    findInjectionPoint,
    injectTypes,
  }
}
