import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      runtime: 'src/runtime.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: ['vite', 'react', 'react-dom', 'react-error-boundary', 'react-intl', 'xstate', '@xstate/react'],
    esbuildOptions(options) {
      options.platform = 'node'
      options.target = 'node20'
    },
  },
  {
    entry: {
      'ts-plugin': 'src/ts-plugin/index.ts',
    },
    format: ['cjs'],
    dts: false,
    sourcemap: false,
    clean: false,
    splitting: false,
    external: ['typescript'],
  },
])
