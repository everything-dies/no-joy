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
    .split('/')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

function buildImports(
  viewPath: string,
  asyncConcernPath: string | undefined,
  asyncExports: string[]
): t.ImportDeclaration[] {
  const imports: t.ImportDeclaration[] = []

  // import { createElement } from 'react'
  imports.push(
    t.importDeclaration(
      [t.importSpecifier(t.identifier('createElement'), t.identifier('createElement'))],
      t.stringLiteral('react')
    )
  )

  // import { useNojoy } from 'nojoy/runtime'
  imports.push(
    t.importDeclaration(
      [t.importSpecifier(t.identifier('useNojoy'), t.identifier('useNojoy'))],
      t.stringLiteral('nojoy/runtime')
    )
  )

  // import { useAsyncHandler } from 'nojoy/runtime'
  if (asyncExports.length > 0) {
    imports.push(
      t.importDeclaration(
        [t.importSpecifier(t.identifier('useAsyncHandler'), t.identifier('useAsyncHandler'))],
        t.stringLiteral('nojoy/runtime')
      )
    )
  }

  // import View from '<viewPath>'
  imports.push(
    t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier('View'))],
      t.stringLiteral(viewPath)
    )
  )

  // import { click, submit } from '<asyncConcernPath>'
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

  // const dataPlane = useNojoy()
  body.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('dataPlane'),
        t.callExpression(t.identifier('useNojoy'), [])
      ),
    ])
  )

  // const clickHandler = useAsyncHandler(click, dataPlane)
  for (const name of asyncExports) {
    body.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(`${name}Handler`),
          t.callExpression(t.identifier('useAsyncHandler'), [
            t.identifier(name),
            t.identifier('dataPlane'),
          ])
        ),
      ])
    )
  }

  // return createElement(View, { ...props, click: clickHandler })
  const propsArg =
    asyncExports.length > 0
      ? t.objectExpression([
          t.spreadElement(t.identifier('props')),
          ...asyncExports.map((name) =>
            t.objectProperty(
              t.identifier(name),
              t.identifier(`${name}Handler`)
            )
          ),
        ])
      : t.identifier('props')

  body.push(
    t.returnStatement(
      t.callExpression(t.identifier('createElement'), [
        t.identifier('View'),
        propsArg,
      ])
    )
  )

  const fn = t.functionDeclaration(
    t.identifier(`Nojoy${displayName}`),
    [t.identifier('props')],
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
