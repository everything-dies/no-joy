import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractExportNames } from '../../src/plugin/exports'

const FIXTURES = resolve(__dirname, 'fixtures/basic')

describe('extractExportNames', () => {
  it('extracts named exports from async.ts', () => {
    const names = extractExportNames(
      resolve(FIXTURES, 'components/button/async.ts')
    )
    expect(names).toEqual(['click'])
  })

  it('extracts named exports from service index.ts', () => {
    const names = extractExportNames(
      resolve(FIXTURES, 'services/users/index.ts')
    )
    expect(names).toEqual(['getById'])
  })

  it('returns empty array for files with no named exports', () => {
    // The client index.ts only has a default export
    const names = extractExportNames(
      resolve(FIXTURES, 'clients/rest/index.ts')
    )
    expect(names).toEqual([])
  })
})
