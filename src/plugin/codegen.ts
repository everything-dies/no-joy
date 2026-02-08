import { extractExportNames } from './exports'

import { type ComponentEntry } from './scanner'

export function generateComponentWrapper(component: ComponentEntry): string {
  const lines: string[] = []
  const asyncConcern = component.concerns['async']
  const asyncExports = asyncConcern ? extractExportNames(asyncConcern) : []

  // Imports
  lines.push(`import { createElement } from 'react'`)
  lines.push(`import { useNojoy } from 'nojoy/runtime'`)

  if (asyncExports.length > 0) {
    lines.push(`import { useAsyncHandler } from 'nojoy/runtime'`)
  }

  lines.push(`import View from '${component.viewPath}'`)

  if (asyncExports.length > 0) {
    const imports = asyncExports.join(', ')
    lines.push(`import { ${imports} } from '${asyncConcern}'`)
  }

  lines.push('')

  // Component function
  const displayName = component.name
    .split('/')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')

  lines.push(`export default function Nojoy${displayName}(props) {`)
  lines.push(`  const dataPlane = useNojoy()`)

  // Static hook call per async export (rules of hooks compliant)
  for (const name of asyncExports) {
    lines.push(`  const ${name}Handler = useAsyncHandler(${name}, dataPlane)`)
  }

  lines.push('')

  if (asyncExports.length > 0) {
    const handlerProps = asyncExports
      .map((name) => `${name}: ${name}Handler`)
      .join(', ')
    lines.push(
      `  return createElement(View, { ...props, ${handlerProps} })`
    )
  } else {
    lines.push(`  return createElement(View, props)`)
  }

  lines.push(`}`)
  lines.push('')
  lines.push(`Nojoy${displayName}.displayName = '${displayName}'`)
  lines.push('')

  return lines.join('\n')
}
