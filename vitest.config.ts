import { configDefaults, defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-tui-protocol': resolve(import.meta.dirname, 'src/protocol.ts'),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '**/._*'],
  },
})
