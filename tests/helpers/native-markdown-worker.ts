import { build } from 'tsdown'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { aliases } from '../../tsdown.config.ts'

/** Exercise the packaged worker entry with the real bundler, not a fake parser. */
export async function prepareMarkdownWorker(): Promise<() => Worker> {
  const artifacts = resolve('.artifacts')
  mkdirSync(artifacts, { recursive: true })
  const directory = mkdtempSync(join(artifacts, 'markdown-worker-test-'))
  await build({ config: false, entry: { 'native-markdown-worker': 'src/client/native-markdown-worker.ts' },
    outDir: directory, platform: 'node', format: 'esm', target: 'node22.19', alias: aliases,
    noExternal: [/@mariozechner\/pi-tui/, /@deepseek-ai\/dsh-tui-protocol/], logLevel: 'silent' })
  return () => new Worker(join(directory, 'native-markdown-worker.js'))
}
