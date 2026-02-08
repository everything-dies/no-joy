import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { nojoyPlugin } from '../src/plugin/vite-plugin'

export default defineConfig({
  plugins: [nojoyPlugin(), react()],
  resolve: {
    alias: {
      'nojoy/runtime': path.resolve(__dirname, '../src/runtime.ts'),
      'nojoy': path.resolve(__dirname, '../src/index.ts'),
    },
  },
})
