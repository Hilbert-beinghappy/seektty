import { configDefaults, defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { aliases } from './tsdown.config.ts'

export default defineConfig({
  resolve: {
    alias: {
      ...aliases,
      '@deepseek-ai/dsh-tui-protocol': resolve(import.meta.dirname, 'src/protocol.ts'),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '**/._*', '**/.artifacts/**'],
  },
})
