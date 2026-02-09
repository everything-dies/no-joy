import _generate from '@babel/generator'
import * as t from '@babel/types'
import { join, relative, sep } from 'node:path'

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
  i18n: string | undefined
}

function buildImports(
  prefix: string,
  concerns: ConcernPaths,
  asyncExports: string[]
): t.Statement[] {
  const statements: t.Statement[] = []

  // React imports: createElement (always), lazy (always), Suspense (if placeholder)
  const reactSpecifiers: t.ImportSpecifier[] = [
    t.importSpecifier(
      t.identifier(`${prefix}createElement`),
      t.identifier('createElement')
    ),
    t.importSpecifier(t.identifier(`${prefix}lazy`), t.identifier('lazy')),
  ]
  if (concerns.placeholder || concerns.i18n) {
    reactSpecifiers.push(
      t.importSpecifier(
        t.identifier(`${prefix}Suspense`),
        t.identifier('Suspense')
      )
    )
  }
  statements.push(
    t.importDeclaration(reactSpecifiers, t.stringLiteral('react'))
  )

  // nojoy/runtime imports (only if async exports exist)
  if (asyncExports.length > 0) {
    statements.push(
      t.importDeclaration(
        [
          t.importSpecifier(
            t.identifier(`${prefix}useNojoy`),
            t.identifier('useNojoy')
          ),
        ],
        t.stringLiteral('nojoy/runtime')
      )
    )
    statements.push(
      t.importDeclaration(
        [
          t.importSpecifier(
            t.identifier(`${prefix}useAsyncHandler`),
            t.identifier('useAsyncHandler')
          ),
        ],
        t.stringLiteral('nojoy/runtime')
      )
    )
  }

  // useI18n import (if i18n concern exists)
  if (concerns.i18n) {
    statements.push(
      t.importDeclaration(
        [
          t.importSpecifier(
            t.identifier(`${prefix}useI18n`),
            t.identifier('useI18n')
          ),
        ],
        t.stringLiteral('nojoy/runtime')
      )
    )
    statements.push(
      t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier(`${prefix}i18nDefaults`))],
        t.stringLiteral(concerns.i18n)
      )
    )
  }

  // ErrorBoundary import (if error concern exists)
  if (concerns.error) {
    statements.push(
      t.importDeclaration(
        [
          t.importSpecifier(
            t.identifier(`${prefix}ErrorBoundary`),
            t.identifier('ErrorBoundary')
          ),
        ],
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

function buildI18nDeclarations(
  prefix: string,
  component: ComponentEntry,
  root: string
): t.Statement[] {
  const statements: t.Statement[] = []

  // const _x$i18nNamespace = "src/components/widgets/button"
  const relativePath = relative(root, component.dir).split(sep).join('/')
  statements.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(`${prefix}i18nNamespace`),
        t.stringLiteral(relativePath)
      ),
    ])
  )

  // const _x$i18nTranslations = import.meta.glob("/abs/path/button/i18n/*.json")
  const globPattern = join(component.dir, 'i18n', '*.json').split(sep).join('/')
  statements.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(`${prefix}i18nTranslations`),
        t.callExpression(
          t.memberExpression(
            t.metaProperty(t.identifier('import'), t.identifier('meta')),
            t.identifier('glob')
          ),
          [t.stringLiteral(globPattern)]
        )
      ),
    ])
  )

  return statements
}

function buildComponentFunction(
  prefix: string,
  displayName: string,
  asyncExports: string[],
  concerns: ConcernPaths
): t.Statement[] {
  // Build hook call statements
  const hookStatements: t.Statement[] = []

  if (asyncExports.length > 0) {
    hookStatements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(`${prefix}dataPlane`),
          t.callExpression(t.identifier(`${prefix}useNojoy`), [])
        ),
      ])
    )
    for (const name of asyncExports) {
      hookStatements.push(
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

  if (concerns.i18n) {
    hookStatements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(`${prefix}i18n`),
          t.callExpression(t.identifier(`${prefix}useI18n`), [
            t.identifier(`${prefix}i18nDefaults`),
            t.identifier(`${prefix}i18nNamespace`),
            t.identifier(`${prefix}i18nTranslations`),
          ])
        ),
      ])
    )
  }

  // Build view element props
  const concernProps: t.ObjectProperty[] = asyncExports.map((name) =>
    t.objectProperty(t.identifier(name), t.identifier(`${prefix}${name}`))
  )
  if (concerns.i18n) {
    concernProps.push(
      t.objectProperty(t.identifier('i18n'), t.identifier(`${prefix}i18n`))
    )
  }

  const propsArg =
    concernProps.length > 0
      ? t.objectExpression([
          t.spreadElement(t.identifier(`${prefix}props`)),
          ...concernProps,
        ])
      : t.identifier(`${prefix}props`)

  // View element: createElement(View, propsArg)
  const viewElement: t.Expression = t.callExpression(
    t.identifier(`${prefix}createElement`),
    [t.identifier(`${prefix}View`), propsArg]
  )

  // When i18n exists, split into inner (hooks) + outer (boundaries)
  // because useI18n throws Promises for Suspense — the Suspense boundary
  // must be an ancestor component, not in the same render function.
  if (concerns.i18n) {
    const innerFn = t.functionDeclaration(
      t.identifier(`${prefix}Inner`),
      [t.identifier(`${prefix}props`)],
      t.blockStatement([...hookStatements, t.returnStatement(viewElement)])
    )

    // Outer wraps createElement(Inner, props) with Suspense + ErrorBoundary
    let outerElement: t.Expression = t.callExpression(
      t.identifier(`${prefix}createElement`),
      [t.identifier(`${prefix}Inner`), t.identifier(`${prefix}props`)]
    )

    // Suspense (always when i18n — needed for useI18n's thrown Promise)
    const fallback = concerns.placeholder
      ? t.callExpression(t.identifier(`${prefix}createElement`), [
          t.identifier(`${prefix}Placeholder`),
          t.nullLiteral(),
        ])
      : t.nullLiteral()

    outerElement = t.callExpression(t.identifier(`${prefix}createElement`), [
      t.identifier(`${prefix}Suspense`),
      t.objectExpression([
        t.objectProperty(t.identifier('fallback'), fallback),
      ]),
      outerElement,
    ])

    if (concerns.error) {
      outerElement = t.callExpression(t.identifier(`${prefix}createElement`), [
        t.identifier(`${prefix}ErrorBoundary`),
        t.objectExpression([
          t.objectProperty(
            t.identifier('FallbackComponent'),
            t.identifier(`${prefix}ErrorFallback`)
          ),
        ]),
        outerElement,
      ])
    }

    const outerFn = t.functionDeclaration(
      t.identifier(`Nojoy${displayName}`),
      [t.identifier(`${prefix}props`)],
      t.blockStatement([t.returnStatement(outerElement)])
    )

    return [innerFn, outerFn]
  }

  // No i18n — single function with inline wrapping
  let element: t.Expression = viewElement

  if (concerns.placeholder) {
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

  if (concerns.error) {
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

  return [
    t.functionDeclaration(
      t.identifier(`Nojoy${displayName}`),
      [t.identifier(`${prefix}props`)],
      t.blockStatement([...hookStatements, t.returnStatement(element)])
    ),
  ]
}

export function generateComponentWrapper(
  component: ComponentEntry,
  prefix: string,
  root: string
): string {
  const concerns: ConcernPaths = {
    async: component.concerns['async'],
    placeholder: component.concerns['placeholder'],
    error: component.concerns['error'],
    i18n: component.concerns['i18n'],
  }
  const asyncExports = concerns.async ? extractExportNames(concerns.async) : []
  const displayName = buildDisplayName(component.name)

  const imports = buildImports(prefix, concerns, asyncExports)
  const viewDecl = buildViewDeclaration(prefix, component.viewPath)
  const i18nDecls = concerns.i18n
    ? buildI18nDeclarations(prefix, component, root)
    : []
  const componentStatements = buildComponentFunction(
    prefix,
    displayName,
    asyncExports,
    concerns
  )

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
    ...i18nDecls,
    ...componentStatements,
    displayNameAssignment,
    defaultExport,
  ])

  const file = t.file(program)
  const { code } = generate(file)

  return code
}
