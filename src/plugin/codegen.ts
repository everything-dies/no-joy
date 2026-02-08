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

const PREFIX = '__nojoy$'

function buildImports(
  viewPath: string,
  asyncConcernPath: string | undefined,
  asyncExports: string[]
): t.ImportDeclaration[] {
  const imports: t.ImportDeclaration[] = []

  // import { createElement as __nojoy$createElement } from 'react'
  imports.push(
    t.importDeclaration(
      [t.importSpecifier(t.identifier(`${PREFIX}createElement`), t.identifier('createElement'))],
      t.stringLiteral('react')
    )
  )

  // import { useNojoy as __nojoy$useNojoy } from 'nojoy/runtime'
  imports.push(
    t.importDeclaration(
      [t.importSpecifier(t.identifier(`${PREFIX}useNojoy`), t.identifier('useNojoy'))],
      t.stringLiteral('nojoy/runtime')
    )
  )

  // import { useAsyncHandler as __nojoy$useAsyncHandler } from 'nojoy/runtime'
  if (asyncExports.length > 0) {
    imports.push(
      t.importDeclaration(
        [t.importSpecifier(t.identifier(`${PREFIX}useAsyncHandler`), t.identifier('useAsyncHandler'))],
        t.stringLiteral('nojoy/runtime')
      )
    )
  }

  // import __nojoy$View from '<viewPath>'
  imports.push(
    t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier(`${PREFIX}View`))],
      t.stringLiteral(viewPath)
    )
  )

  // import { click, submit } from '<asyncConcernPath>' — user-authored, no prefix
  if (asyncConcernPath && asyncExports.length > 0) {
    imports.push(
      t.importDeclaration(
        asyncExports.map((name) =>
          t.importSpecifier(t.identifier(name), t.identifier(name))
        ),
        t.stringLiteral(asyncConcernPath)
      )
    )
  }

  return imports
}

function buildComponentFunction(
  displayName: string,
  asyncExports: string[]
): t.FunctionDeclaration {
  const body: t.Statement[] = []

  // const __nojoy$dataPlane = __nojoy$useNojoy()
  body.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(`${PREFIX}dataPlane`),
        t.callExpression(t.identifier(`${PREFIX}useNojoy`), [])
      ),
    ])
  )

  // const __nojoy$click = __nojoy$useAsyncHandler(click, __nojoy$dataPlane)
  for (const name of asyncExports) {
    body.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(`${PREFIX}${name}`),
          t.callExpression(t.identifier(`${PREFIX}useAsyncHandler`), [
            t.identifier(name),
            t.identifier(`${PREFIX}dataPlane`),
          ])
        ),
      ])
    )
  }

  // return __nojoy$createElement(__nojoy$View, { ...__nojoy$props, click: __nojoy$click })
  const propsArg =
    asyncExports.length > 0
      ? t.objectExpression([
          t.spreadElement(t.identifier(`${PREFIX}props`)),
          ...asyncExports.map((name) =>
            t.objectProperty(
              t.identifier(name),
              t.identifier(`${PREFIX}${name}`)
            )
          ),
        ])
      : t.identifier(`${PREFIX}props`)

  body.push(
    t.returnStatement(
      t.callExpression(t.identifier(`${PREFIX}createElement`), [
        t.identifier(`${PREFIX}View`),
        propsArg,
      ])
    )
  )

  const fn = t.functionDeclaration(
    t.identifier(`Nojoy${displayName}`),
    [t.identifier(`${PREFIX}props`)],
    t.blockStatement(body)
  )

  return fn
}

export function generateComponentWrapper(component: ComponentEntry): string {
  const asyncConcern = component.concerns['async']
  const asyncExports = asyncConcern ? extractExportNames(asyncConcern) : []
  const displayName = buildDisplayName(component.name)

  const imports = buildImports(
    component.viewPath,
    asyncConcern,
    asyncExports
  )

  const componentFn = buildComponentFunction(displayName, asyncExports)

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
    componentFn,
    displayNameAssignment,
    defaultExport,
  ])

  const file = t.file(program)
  const { code } = generate(file)

  return code
}
