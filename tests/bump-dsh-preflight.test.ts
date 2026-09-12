import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

it.each(['missing-package', 'registry-error', 'invalid-source', 'missing-range', 'missing-tested'])('does not partially bump on %s', scenario => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'seektty-bump-preflight-'))
  try {
    mkdirSync(resolve(fixture, 'scripts'))
    mkdirSync(resolve(fixture, 'src'))
    for (const name of ['bump-dsh.mjs', 'bump-readme.mjs', 'dsh-peer-range.mjs']) {
      writeFileSync(resolve(fixture, 'scripts', name), readFileSync(resolve(root, 'scripts', name)))
    }
    const inputs = {
      'package.json': JSON.stringify({ dsh: { compatibility: { tested: '0.1.5-rc.1', minimum: '0.1.5-rc.1' } },
        devDependencies: { '@deepseek-ai/dsh-session': '0.1.5-rc.1' }, peerDependencies: { '@deepseek-ai/dsh-session': '0.1.5-rc.1' } }),
      'pnpm-workspace.yaml': "overrides:\n  '@deepseek-ai/dsh-session': 0.1.5-rc.1\n  '@deepseek-ai/dsh-tools': 0.1.5-rc.1\n",
      'src/dsh-compat.ts': "export const compatibility = { tested: '0.1.5-rc.1', }\n",
      'src/pnpm-compat.ts': scenario === 'invalid-source' ? '// missing pins\n' : "export const PNPM_GVS_DSH_RANGE = '0.1.5-rc.1'; export const tested = { dsh: '0.1.5-rc.1' }\n",
      'README.md': 'fixture README', 'README.zh.md': 'fixture README zh',
    }
    if (scenario === 'missing-range') inputs['src/pnpm-compat.ts'] = "export const tested = { dsh: '0.1.5-rc.1' }\n"
    if (scenario === 'missing-tested') inputs['src/pnpm-compat.ts'] = "export const PNPM_GVS_DSH_RANGE = '0.1.5-rc.1'\n"
    for (const [name, content] of Object.entries(inputs)) writeFileSync(resolve(fixture, name), content)
    const status = scenario === 'missing-package' ? 404 : scenario === 'registry-error' ? 503 : 200
    const mock = `globalThis.fetch = async () => new Response(JSON.stringify({version:'0.1.5-rc.2'}), {status:${status}});`
    const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(mock)}`,
      resolve(fixture, 'scripts/bump-dsh.mjs'), '0.1.5-rc.2'], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(scenario === 'missing-package' ? /人工迁移/ : scenario === 'registry-error' ? /503/ : /no files written/)
    for (const [name, content] of Object.entries(inputs)) expect(readFileSync(resolve(fixture, name), 'utf8')).toBe(content)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})
