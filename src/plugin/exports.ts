import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import { readFileSync } from 'node:fs'

// Handle CJS/ESM interop for @babel/traverse
const traverse =
  typeof _traverse === 'function'
    ? _traverse
    : (_traverse as { default: typeof _traverse }).default

export function extractExportNames(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8')
  const ast = parse(content, {
    sourceType: 'module',
    plugins: ['typescript'],
  })

  const names: string[] = []

  traverse(ast, {
    ExportNamedDeclaration(path) {
      const { declaration, specifiers } = path.node

      // export const foo = ..., export function foo() {}, export class Foo {}
      if (declaration) {
        if (
          declaration.type === 'VariableDeclaration' &&
          declaration.declarations
        ) {
          for (const declarator of declaration.declarations) {
            if (declarator.id.type === 'Identifier') {
              names.push(declarator.id.name)
            }
          }
        } else if (
          (declaration.type === 'FunctionDeclaration' ||
            declaration.type === 'ClassDeclaration' ||
            declaration.type === 'TSDeclareFunction' ||
            declaration.type === 'TSEnumDeclaration') &&
          declaration.id
        ) {
          names.push(declaration.id.name)
        }
      }

      // export { foo, bar }
      for (const spec of specifiers) {
        const exported = spec.exported
        if (exported.type === 'Identifier') {
          names.push(exported.name)
        }
      }
    },
  })

  return names
}
