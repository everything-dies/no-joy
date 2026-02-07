import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['vite', 'react', 'react-dom', 'xstate', '@xstate/react'],
  esbuildOptions(options) {
    options.platform = 'node'
    options.target = 'node20'
  },
})
