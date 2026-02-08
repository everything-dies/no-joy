import _generate from '@babel/generator'
import * as t from '@babel/types'

import { extractExportNames } from './exports'

import { type ComponentEntry } from './scanner'

// Handle CJS/ESM interop for @babel/generator
const generate =
  typeof _generate === 'function'
    ? _generate
    : (_generate as { default: typeof _generate }).default

function buildDisplayName(name: string): string {
  return name
    .split(/[/\-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

const HASH_LENGTH = 8
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function generatePrefix(): string {
  let hash = ''
  for (let i = 0; i < HASH_LENGTH; i++) {
    hash += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `_${hash}$`
}

interface ConcernPaths {
  async: string | undefined
  placeholder: string | undefined
  error: string | undefined
}

function buildImports(
  prefix: string,
  concerns: ConcernPaths,
  asyncExports: string[]
): t.Statement[] {
  const statements: t.Statement[] = []

  // React imports: createElement (always), lazy (always), Suspense (if placeholder)
  const reactSpecifiers: t.ImportSpecifier[] = [
    t.importSpecifier(t.identifier(`${prefix}createElement`), t.identifier('createElement')),
    t.importSpecifier(t.identifier(`${prefix}lazy`), t.identifier('lazy')),
  ]
  if (concerns.placeholder) {
    reactSpecifiers.push(
      t.importSpecifier(t.identifier(`${prefix}Suspense`), t.identifier('Suspense'))
    )
  }
  statements.push(
    t.importDeclaration(reactSpecifiers, t.stringLiteral('react'))
  )

  // nojoy/runtime imports (only if async exports exist)
  if (asyncExports.length > 0) {
    statements.push(
      t.importDeclaration(
        [t.importSpecifier(t.identifier(`${prefix}useNojoy`), t.identifier('useNojoy'))],
        t.stringLiteral('nojoy/runtime')
      )
    )
    statements.push(
      t.importDeclaration(
        [t.importSpecifier(t.identifier(`${prefix}useAsyncHandler`), t.identifier('useAsyncHandler'))],
        t.stringLiteral('nojoy/runtime')
      )
    )
  }

  // ErrorBoundary import (if error concern exists)
  if (concerns.error) {
    statements.push(
      t.importDeclaration(
        [t.importSpecifier(t.identifier(`${prefix}ErrorBoundary`), t.identifier('ErrorBoundary'))],
        t.stringLiteral('react-error-boundary')
      )
    )
    statements.push(
      t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier(`${prefix}ErrorFallback`))],
        t.stringLiteral(concerns.error)
      )
    )
  }

  // Placeholder import (if placeholder concern exists)
  if (concerns.placeholder) {
    statements.push(
      t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier(`${prefix}Placeholder`))],
        t.stringLiteral(concerns.placeholder)
      )
    )
  }

  // Async factory imports — user-authored, no prefix
  if (concerns.async && asyncExports.length > 0) {
    statements.push(
      t.importDeclaration(
        asyncExports.map((name) =>
          t.importSpecifier(t.identifier(name), t.identifier(name))
        ),
        t.stringLiteral(concerns.async)
      )
    )
  }

  // View: const _x$View = _x$lazy(() => import("viewPath"))
  // This is a variable declaration, not an import — appended after imports

  return statements
}

function buildViewDeclaration(
  prefix: string,
  viewPath: string
): t.VariableDeclaration {
  // const _x$View = _x$lazy(() => import("viewPath"))
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(`${prefix}View`),
      t.callExpression(t.identifier(`${prefix}lazy`), [
        t.arrowFunctionExpression(
          [],
          t.callExpression(t.import(), [t.stringLiteral(viewPath)])
        ),
      ])
    ),
  ])
}

function buildComponentFunction(
  prefix: string,
  displayName: string,
  asyncExports: string[],
  concerns: ConcernPaths
): t.FunctionDeclaration {
  const body: t.Statement[] = []

  // Hook calls (only if async exports exist)
  if (asyncExports.length > 0) {
    // const _x$dataPlane = _x$useNojoy()
    body.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(`${prefix}dataPlane`),
          t.callExpression(t.identifier(`${prefix}useNojoy`), [])
        ),
      ])
    )

    // const _x$click = _x$useAsyncHandler(click, _x$dataPlane)
    for (const name of asyncExports) {
      body.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(`${prefix}${name}`),
            t.callExpression(t.identifier(`${prefix}useAsyncHandler`), [
              t.identifier(name),
              t.identifier(`${prefix}dataPlane`),
            ])
          ),
        ])
      )
    }
  }

  // Build view element props
  const propsArg =
    asyncExports.length > 0
      ? t.objectExpression([
          t.spreadElement(t.identifier(`${prefix}props`)),
          ...asyncExports.map((name) =>
            t.objectProperty(
              t.identifier(name),
              t.identifier(`${prefix}${name}`)
            )
          ),
        ])
      : t.identifier(`${prefix}props`)

  // Build view element: createElement(View, propsArg)
  let element: t.Expression = t.callExpression(
    t.identifier(`${prefix}createElement`),
    [t.identifier(`${prefix}View`), propsArg]
  )

  // Wrap with Suspense if placeholder exists
  if (concerns.placeholder) {
    // createElement(Suspense, { fallback: createElement(Placeholder, null) }, viewElement)
    element = t.callExpression(t.identifier(`${prefix}createElement`), [
      t.identifier(`${prefix}Suspense`),
      t.objectExpression([
        t.objectProperty(
          t.identifier('fallback'),
          t.callExpression(t.identifier(`${prefix}createElement`), [
            t.identifier(`${prefix}Placeholder`),
            t.nullLiteral(),
          ])
        ),
      ]),
      element,
    ])
  }

  // Wrap with ErrorBoundary if error exists
  if (concerns.error) {
    // createElement(ErrorBoundary, { FallbackComponent: ErrorFallback }, element)
    element = t.callExpression(t.identifier(`${prefix}createElement`), [
      t.identifier(`${prefix}ErrorBoundary`),
      t.objectExpression([
        t.objectProperty(
          t.identifier('FallbackComponent'),
          t.identifier(`${prefix}ErrorFallback`)
        ),
      ]),
      element,
    ])
  }

  body.push(t.returnStatement(element))

  return t.functionDeclaration(
    t.identifier(`Nojoy${displayName}`),
    [t.identifier(`${prefix}props`)],
    t.blockStatement(body)
  )
}

export function generateComponentWrapper(component: ComponentEntry, prefix: string): string {
  const concerns: ConcernPaths = {
    async: component.concerns['async'],
    placeholder: component.concerns['placeholder'],
    error: component.concerns['error'],
  }
  const asyncExports = concerns.async ? extractExportNames(concerns.async) : []
  const displayName = buildDisplayName(component.name)

  const imports = buildImports(prefix, concerns, asyncExports)
  const viewDecl = buildViewDeclaration(prefix, component.viewPath)
  const componentFn = buildComponentFunction(prefix, displayName, asyncExports, concerns)

  // Nojoy<Name>.displayName = '<Name>'
  const displayNameAssignment = t.expressionStatement(
    t.assignmentExpression(
      '=',
      t.memberExpression(
        t.identifier(`Nojoy${displayName}`),
        t.identifier('displayName')
      ),
      t.stringLiteral(displayName)
    )
  )

  // export default Nojoy<Name>
  const defaultExport = t.exportDefaultDeclaration(
    t.identifier(`Nojoy${displayName}`)
  )

  const program = t.program([
    ...imports,
    viewDecl,
    componentFn,
    displayNameAssignment,
    defaultExport,
  ])

  const file = t.file(program)
  const { code } = generate(file)

  return code
}
