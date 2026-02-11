import _generate from '@babel/generator'
import * as t from '@babel/types'
import { relative, sep } from 'node:path'

import { extractExportNames } from './exports'
import { type ComponentEntry, type RouteEntry } from './scanner'

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
  skins: Record<string, string> | undefined
  routes: RouteEntry[]
}

function buildElementName(componentName: string): string {
  return `nojoy-${componentName.replace(/\//g, '-')}`
}

// --- Route helpers ---

interface RouteNode {
  route: RouteEntry
  idParts: string[]
}

function routeIdentifierPart(segment: string): string {
  if (segment === '...') return 'splat'
  return segment
    .replace(/^@/, '')
    .replace(/\?$/, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
}

function collectRouteNodes(
  routes: RouteEntry[],
  parentParts: string[] = []
): RouteNode[] {
  const nodes: RouteNode[] = []
  for (const route of routes) {
    const idParts = [...parentParts, routeIdentifierPart(route.segment)]
    nodes.push({ route, idParts })
    nodes.push(...collectRouteNodes(route.children, idParts))
  }
  return nodes
}

function routeTreeHasLoader(routes: RouteEntry[]): boolean {
  for (const route of routes) {
    if (route.asyncPath) return true
    if (routeTreeHasLoader(route.children)) return true
  }
  return false
}

function routeId(prefix: string, idParts: string[]): string {
  return `${prefix}R_${idParts.join('_')}`
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
  const hasSkins = concerns.skins && Object.keys(concerns.skins).length > 0
  if (concerns.placeholder || concerns.i18n || hasSkins) {
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

  // nojoy/runtime imports
  const hasRouteLoaders = routeTreeHasLoader(concerns.routes)
  if (asyncExports.length > 0 || hasRouteLoaders) {
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
  }
  if (asyncExports.length > 0) {
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
  if (hasRouteLoaders) {
    statements.push(
      t.importDeclaration(
        [
          t.importSpecifier(
            t.identifier(`${prefix}useRouteLoader`),
            t.identifier('useRouteLoader')
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

  // styled import (if skins concern exists)
  if (hasSkins) {
    statements.push(
      t.importDeclaration(
        [
          t.importSpecifier(
            t.identifier(`${prefix}styled`),
            t.identifier('styled')
          ),
        ],
        t.stringLiteral('nojoy/runtime')
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

  // Route imports (react-router + per-route loaders & meta)
  if (concerns.routes.length > 0) {
    statements.push(
      t.importDeclaration(
        [
          t.importSpecifier(
            t.identifier(`${prefix}Routes`),
            t.identifier('Routes')
          ),
          t.importSpecifier(
            t.identifier(`${prefix}Route`),
            t.identifier('Route')
          ),
        ],
        t.stringLiteral('react-router')
      )
    )

    const allNodes = collectRouteNodes(concerns.routes)
    for (const { route, idParts } of allNodes) {
      const id = routeId(prefix, idParts)
      if (route.asyncPath) {
        statements.push(
          t.importDeclaration(
            [t.importDefaultSpecifier(t.identifier(`${id}_loader`))],
            t.stringLiteral(route.asyncPath)
          )
        )
      }
      if (route.metaPath) {
        statements.push(
          t.importDeclaration(
            [t.importNamespaceSpecifier(t.identifier(`${id}_meta`))],
            t.stringLiteral(route.metaPath)
          )
        )
      }
    }
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
  root: string,
  srcDir: string
): t.Statement[] {
  const statements: t.Statement[] = []

  // const _x$i18nNamespace = "components/widgets/button"
  const namespace = relative(srcDir, component.dir).split(sep).join('/')
  statements.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(`${prefix}i18nNamespace`),
        t.stringLiteral(namespace)
      ),
    ])
  )

  // const _x$i18nTranslations = import.meta.glob("/.../i18n/*.json", { query: "?url", import: "default", eager: true })
  // Produces { path: assetUrl } — raw JSON files served as static assets, fetched via fetch()
  const rootRelative = relative(root, component.dir).split(sep).join('/')
  const globPattern = `/${rootRelative}/i18n/*.json`
  statements.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(`${prefix}i18nTranslations`),
        t.callExpression(
          t.memberExpression(
            t.metaProperty(t.identifier('import'), t.identifier('meta')),
            t.identifier('glob')
          ),
          [
            t.stringLiteral(globPattern),
            t.objectExpression([
              t.objectProperty(t.identifier('query'), t.stringLiteral('?url')),
              t.objectProperty(
                t.stringLiteral('import'),
                t.stringLiteral('default')
              ),
              t.objectProperty(t.identifier('eager'), t.booleanLiteral(true)),
            ]),
          ]
        )
      ),
    ])
  )

  return statements
}

function buildHookStatements(
  prefix: string,
  asyncExports: string[],
  concerns: ConcernPaths
): t.Statement[] {
  const statements: t.Statement[] = []

  if (asyncExports.length > 0) {
    statements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(`${prefix}dataPlane`),
          t.callExpression(t.identifier(`${prefix}useNojoy`), [])
        ),
      ])
    )
    for (const name of asyncExports) {
      statements.push(
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
    statements.push(
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

  return statements
}

function buildViewElement(
  prefix: string,
  asyncExports: string[],
  concerns: ConcernPaths
): t.Expression {
  const concernProps: t.ObjectProperty[] = asyncExports.map((name) =>
    t.objectProperty(t.identifier(name), t.identifier(`${prefix}${name}`))
  )
  if (concerns.i18n) {
    concernProps.push(
      t.objectProperty(t.identifier('i18n'), t.identifier(`${prefix}i18n`))
    )
  }
  if (concerns.routes.length > 0) {
    concernProps.push(
      t.objectProperty(t.identifier('routes'), t.identifier(`${prefix}routes`))
    )
  }

  const propsArg =
    concernProps.length > 0
      ? t.objectExpression([
          t.spreadElement(t.identifier(`${prefix}props`)),
          ...concernProps,
        ])
      : t.identifier(`${prefix}props`)

  return t.callExpression(t.identifier(`${prefix}createElement`), [
    t.identifier(`${prefix}View`),
    propsArg,
  ])
}

function buildSuspenseFallback(
  prefix: string,
  concerns: ConcernPaths
): t.Expression {
  return concerns.placeholder
    ? t.callExpression(t.identifier(`${prefix}createElement`), [
        t.identifier(`${prefix}Placeholder`),
        t.nullLiteral(),
      ])
    : t.nullLiteral()
}

function wrapWithBoundaries(
  prefix: string,
  element: t.Expression,
  concerns: ConcernPaths,
  needsSuspense: boolean
): t.Expression {
  if (needsSuspense) {
    element = t.callExpression(t.identifier(`${prefix}createElement`), [
      t.identifier(`${prefix}Suspense`),
      t.objectExpression([
        t.objectProperty(
          t.identifier('fallback'),
          buildSuspenseFallback(prefix, concerns)
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

  return element
}

function buildStyledDeclaration(
  prefix: string,
  targetIdentifier: string,
  componentName: string,
  skins: Record<string, string>
): t.VariableDeclaration {
  const elementName = buildElementName(componentName)
  const skinEntries = Object.entries(skins).map(([name, path]) =>
    t.objectProperty(
      t.identifier(name),
      t.arrowFunctionExpression(
        [],
        t.callExpression(t.import(), [t.stringLiteral(path)])
      )
    )
  )

  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(`${prefix}Styled`),
      t.callExpression(t.identifier(`${prefix}styled`), [
        t.identifier(targetIdentifier),
        t.objectExpression([
          t.objectProperty(t.identifier('name'), t.stringLiteral(elementName)),
          t.objectProperty(
            t.identifier('skins'),
            t.objectExpression(skinEntries)
          ),
          t.objectProperty(t.identifier('suspendable'), t.booleanLiteral(true)),
        ]),
      ])
    ),
  ])
}

function buildRouteDeclarations(
  prefix: string,
  routes: RouteEntry[]
): t.Statement[] {
  const statements: t.Statement[] = []
  const allNodes = collectRouteNodes(routes)

  for (const { route, idParts } of allNodes) {
    if (!route.viewPath) continue
    const id = routeId(prefix, idParts)

    // Lazy view: const _x$R_posts_View = _x$lazy(() => import("..."))
    // If the route has a loader, the view gets _View suffix (wrapper takes base name)
    const viewId = route.asyncPath ? `${id}_View` : id
    statements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(viewId),
          t.callExpression(t.identifier(`${prefix}lazy`), [
            t.arrowFunctionExpression(
              [],
              t.callExpression(t.import(), [t.stringLiteral(route.viewPath)])
            ),
          ])
        ),
      ])
    )

    // Wrapper function for routes with loaders
    if (route.asyncPath) {
      statements.push(
        t.functionDeclaration(
          t.identifier(id),
          [t.identifier(`${prefix}props`)],
          t.blockStatement([
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier(`${prefix}dataPlane`),
                t.callExpression(t.identifier(`${prefix}useNojoy`), [])
              ),
            ]),
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier(`${prefix}load`),
                t.callExpression(t.identifier(`${prefix}useRouteLoader`), [
                  t.identifier(`${id}_loader`),
                  t.identifier(`${prefix}dataPlane`),
                ])
              ),
            ]),
            t.returnStatement(
              t.callExpression(t.identifier(`${prefix}createElement`), [
                t.identifier(`${id}_View`),
                t.objectExpression([
                  t.spreadElement(t.identifier(`${prefix}props`)),
                  t.objectProperty(
                    t.identifier('load'),
                    t.identifier(`${prefix}load`)
                  ),
                ]),
              ])
            ),
          ])
        )
      )
    }
  }

  return statements
}

function buildRouteElement(
  prefix: string,
  route: RouteEntry,
  idParts: string[]
): t.Expression {
  const id = routeId(prefix, idParts)

  // Path: meta.route ?? "derivedPath"
  const pathExpr = route.metaPath
    ? t.logicalExpression(
        '??',
        t.memberExpression(t.identifier(`${id}_meta`), t.identifier('route')),
        t.stringLiteral(route.path)
      )
    : t.stringLiteral(route.path)

  const routeProps: t.ObjectProperty[] = [
    t.objectProperty(t.identifier('path'), pathExpr),
  ]

  if (route.viewPath) {
    routeProps.push(
      t.objectProperty(
        t.identifier('element'),
        t.callExpression(t.identifier(`${prefix}createElement`), [
          t.identifier(id),
          t.nullLiteral(),
        ])
      )
    )
  }

  const childElements = route.children.map((child) => {
    const childIdParts = [...idParts, routeIdentifierPart(child.segment)]
    return buildRouteElement(prefix, child, childIdParts)
  })

  return t.callExpression(t.identifier(`${prefix}createElement`), [
    t.identifier(`${prefix}Route`),
    t.objectExpression(routeProps),
    ...childElements,
  ])
}

function buildRoutesElement(
  prefix: string,
  routes: RouteEntry[]
): t.Expression {
  const routeElements = routes.map((route) => {
    const idParts = [routeIdentifierPart(route.segment)]
    return buildRouteElement(prefix, route, idParts)
  })

  return t.callExpression(t.identifier(`${prefix}createElement`), [
    t.identifier(`${prefix}Routes`),
    t.nullLiteral(),
    ...routeElements,
  ])
}

function buildComponentFunction(
  prefix: string,
  displayName: string,
  asyncExports: string[],
  concerns: ConcernPaths,
  componentName: string
): t.Statement[] {
  const hookStatements = buildHookStatements(prefix, asyncExports, concerns)
  const viewElement = buildViewElement(prefix, asyncExports, concerns)
  const hasHooks = hookStatements.length > 0
  const hasSkins = concerns.skins && Object.keys(concerns.skins).length > 0
  const hasRoutes = concerns.routes.length > 0

  // Routes variable declaration (if routes exist)
  const routesStatements: t.Statement[] = hasRoutes
    ? [
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(`${prefix}routes`),
            buildRoutesElement(prefix, concerns.routes)
          ),
        ]),
      ]
    : []

  // --- Skins path: Core (hooks+View) → styled() → outer (boundaries) ---
  if (hasSkins) {
    const statements: t.Statement[] = []

    // 1. Core function (only if hooks or routes exist, otherwise styled wraps View directly)
    let styledTarget: string
    if (hasHooks || hasRoutes) {
      statements.push(
        t.functionDeclaration(
          t.identifier(`${prefix}Core`),
          [t.identifier(`${prefix}props`)],
          t.blockStatement([
            ...hookStatements,
            ...routesStatements,
            t.returnStatement(viewElement),
          ])
        )
      )
      styledTarget = `${prefix}Core`
    } else {
      styledTarget = `${prefix}View`
    }

    // 2. styled() declaration
    statements.push(
      buildStyledDeclaration(
        prefix,
        styledTarget,
        componentName,
        concerns.skins!
      )
    )

    // 3. Outer wrapper: createElement(Styled, props) + boundaries
    let outerElement: t.Expression = t.callExpression(
      t.identifier(`${prefix}createElement`),
      [t.identifier(`${prefix}Styled`), t.identifier(`${prefix}props`)]
    )

    // Suspense always needed with skins (suspendable: true uses React.use())
    outerElement = wrapWithBoundaries(prefix, outerElement, concerns, true)

    statements.push(
      t.functionDeclaration(
        t.identifier(`Nojoy${displayName}`),
        [t.identifier(`${prefix}props`)],
        t.blockStatement([t.returnStatement(outerElement)])
      )
    )

    return statements
  }

  // --- i18n path (no skins): inner (hooks) + outer (boundaries) ---
  if (concerns.i18n) {
    const innerFn = t.functionDeclaration(
      t.identifier(`${prefix}Inner`),
      [t.identifier(`${prefix}props`)],
      t.blockStatement([
        ...hookStatements,
        ...routesStatements,
        t.returnStatement(viewElement),
      ])
    )

    let outerElement: t.Expression = t.callExpression(
      t.identifier(`${prefix}createElement`),
      [t.identifier(`${prefix}Inner`), t.identifier(`${prefix}props`)]
    )

    // Suspense always needed for i18n (useI18n throws Promise)
    outerElement = wrapWithBoundaries(prefix, outerElement, concerns, true)

    const outerFn = t.functionDeclaration(
      t.identifier(`Nojoy${displayName}`),
      [t.identifier(`${prefix}props`)],
      t.blockStatement([t.returnStatement(outerElement)])
    )

    return [innerFn, outerFn]
  }

  // --- Default path (no skins, no i18n): single function ---
  const element = wrapWithBoundaries(
    prefix,
    viewElement,
    concerns,
    !!concerns.placeholder
  )

  return [
    t.functionDeclaration(
      t.identifier(`Nojoy${displayName}`),
      [t.identifier(`${prefix}props`)],
      t.blockStatement([
        ...hookStatements,
        ...routesStatements,
        t.returnStatement(element),
      ])
    ),
  ]
}

export function generateComponentWrapper(
  component: ComponentEntry,
  prefix: string,
  root: string,
  srcDir: string = root
): string {
  const skins =
    component.skins && Object.keys(component.skins).length > 0
      ? component.skins
      : undefined
  const concerns: ConcernPaths = {
    async: component.concerns['async'],
    placeholder: component.concerns['placeholder'],
    error: component.concerns['error'],
    i18n: component.concerns['i18n'],
    skins,
    routes: component.routes,
  }
  const asyncExports = concerns.async ? extractExportNames(concerns.async) : []
  const displayName = buildDisplayName(component.name)

  const imports = buildImports(prefix, concerns, asyncExports)
  const viewDecl = buildViewDeclaration(prefix, component.viewPath)
  const i18nDecls = concerns.i18n
    ? buildI18nDeclarations(prefix, component, root, srcDir)
    : []
  const routeDecls = buildRouteDeclarations(prefix, component.routes)
  const componentStatements = buildComponentFunction(
    prefix,
    displayName,
    asyncExports,
    concerns,
    component.name
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
    ...routeDecls,
    ...componentStatements,
    displayNameAssignment,
    defaultExport,
  ])

  const file = t.file(program)
  const { code } = generate(file)

  return code
}
