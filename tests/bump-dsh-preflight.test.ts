import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

it('bumps the complete current contract twice while preserving published release and rollback records', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'seektty-bump-success-'))
  const initial = '0.1.5-rc.1'
  const packages = ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-tools']
  const install = (version: string) => `pnpm add --global --config.enable-global-virtual-store=false @deepseek-ai/dsh@${version}`
  const readmes = [
    {
      path: 'README.md', heading: 'Development checkout', quickStart: 'Quick start',
      current: 'The current tested Host is official', table: 'Current tested Harness Host',
      adapter: 'pnpm 11 layout adapter', release: 'Published release', rollback: 'Rollback record',
    },
    {
      path: 'README.zh.md', heading: '开发分支', quickStart: '快速开始',
      current: '当前已测 Host 是官方', table: '当前已测 Harness Host',
      adapter: 'pnpm 11 布局适配器', release: '已发布版本', rollback: '回滚记录',
    },
  ]
  try {
    mkdirSync(resolve(fixture, 'scripts'))
    mkdirSync(resolve(fixture, 'src'))
    for (const name of ['bump-dsh.mjs', 'bump-readme.mjs', 'dsh-peer-range.mjs']) {
      writeFileSync(resolve(fixture, 'scripts', name), readFileSync(resolve(root, 'scripts', name)))
    }
    writeFileSync(resolve(fixture, 'package.json'), JSON.stringify({
      name: 'seektty', version: '1.2.6',
      dsh: { bundle: { patch: './cordis.patch.yml' }, compatibility: { minimum: initial, tested: initial } },
      dependencies: { zod: '4.4.3' },
      devDependencies: { '@deepseek-ai/dsh-session': initial, '@deepseek-ai/dsh-agent': initial, vitest: '4.0.15' },
      peerDependencies: { '@deepseek-ai/dsh-session': initial, '@deepseek-ai/dsh-agent': initial, '@deepseek-ai/cordis': '^4.0.2' },
      peerDependenciesMeta: { '@deepseek-ai/dsh-session': { optional: true } },
    }))
    writeFileSync(resolve(fixture, 'pnpm-workspace.yaml'),
      `# Exact internal closure for the audited dsh ${initial} target.\noverrides:\n${packages.map(name => `  '${name}': ${initial}\n`).join('')}  zod: 4.4.3\n`)
    writeFileSync(resolve(fixture, 'src/dsh-compat.ts'),
      `export const compatibility = { minimum: '${initial}', tested: '${initial}', }\n`)
    writeFileSync(resolve(fixture, 'src/pnpm-compat.ts'),
      `export const PNPM_GVS_DSH_RANGE = '${initial}'; export const tested = { dsh: '${initial}', pnpm: '11.7.0' }\n`)
    for (const readme of readmes) {
      writeFileSync(resolve(fixture, readme.path), [
        `<img src="https://img.shields.io/badge/DeepSeek%20Harness-${initial.replaceAll('-', '--')}-5B5BD6" alt="DeepSeek Harness ${initial}">`,
        `## ${readme.heading}`, '', `${readme.current} \`${initial}\`.`, '',
        '```sh', install(initial), 'dsh plugin --profile tui add ./seektty-1.2.6.tgz', '```', '',
        `| ${readme.table} | \`${initial}\` |`,
        `| ${readme.adapter} | pnpm \`11.7.0\`; dsh \`${initial}\`; GVS=false |`, '',
        `## ${readme.quickStart}`, '', `${readme.release}: seektty@1.2.6 / dsh \`${initial}\`.`, '',
        '```sh', install(initial), 'dsh plugin --profile tui add seektty@1.2.6', '```', '',
        `[${readme.release}](docs/dsh-${initial}-adaptation.md)`, '',
        `## ${readme.rollback}`, '', `dsh \`0.1.5-rc.2\` → \`${initial}\`.`, '',
        '```sh', install('0.1.5-rc.2'), '```', '',
        `[${readme.rollback}](docs/dsh-0.1.5-rc.2-adaptation.md)`, '',
      ].join('\n'))
    }
    for (const target of ['0.1.5-rc.2', '0.1.5-rc.3']) {
      const requestsPath = resolve(fixture, 'registry-requests.jsonl')
      writeFileSync(requestsPath, '')
      const mock = `
        import { appendFileSync } from 'node:fs';
        globalThis.fetch = async input => {
          const url = String(input);
          appendFileSync(${JSON.stringify(requestsPath)}, JSON.stringify(url) + '\\n');
          if (url === 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags') {
            return new Response(JSON.stringify({ latest: '${target}', next: '0.1.5-rc.99' }));
          }
          const packages = ${JSON.stringify(packages)};
          const found = packages.some(name => url === 'https://registry.npmjs.org/' + encodeURIComponent(name) + '/${target}');
          if (!found) throw new Error('Unexpected registry request: ' + url);
          return new Response(JSON.stringify({ version: '${target}' }));
        };
      `
      // The second bump also exercises npm latest discovery, ignoring npm next.
      const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(mock)}`,
        resolve(fixture, 'scripts/bump-dsh.mjs'), ...(target === '0.1.5-rc.2' ? [target] : [])], { encoding: 'utf8' })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      expect(result.stdout).toContain(`-> ${target}`)
      const manifest = JSON.parse(readFileSync(resolve(fixture, 'package.json'), 'utf8'))
      expect(manifest.name).toBe('seektty')
      expect(manifest.version).toBe('1.2.6')
      expect(manifest.dsh).toEqual({ bundle: { patch: './cordis.patch.yml' }, compatibility: { minimum: initial, tested: target } })
      expect(manifest.dependencies).toEqual({ zod: '4.4.3' })
      expect(manifest.devDependencies).toEqual({ '@deepseek-ai/dsh-session': target, '@deepseek-ai/dsh-agent': target, vitest: '4.0.15' })
      expect(manifest.peerDependencies).toEqual({ '@deepseek-ai/dsh-session': target, '@deepseek-ai/dsh-agent': target, '@deepseek-ai/cordis': '^4.0.2' })
      expect(manifest.peerDependenciesMeta).toEqual({ '@deepseek-ai/dsh-session': { optional: true } })
      expect(readFileSync(resolve(fixture, 'pnpm-workspace.yaml'), 'utf8')).toBe(
        `# Exact internal closure for the audited dsh ${target} target.\noverrides:\n${packages.map(name => `  '${name}': ${target}\n`).join('')}  zod: 4.4.3\n`)
      expect(readFileSync(resolve(fixture, 'src/dsh-compat.ts'), 'utf8')).toBe(
        `export const compatibility = { minimum: '${initial}', tested: '${target}', }\n`)
      expect(readFileSync(resolve(fixture, 'src/pnpm-compat.ts'), 'utf8')).toBe(
        `export const PNPM_GVS_DSH_RANGE = '${target}'; export const tested = { dsh: '${target}', pnpm: '11.7.0' }\n`)
      const requests = readFileSync(requestsPath, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      expect(requests).toEqual([
        ...(target === '0.1.5-rc.3' ? ['https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'] : []),
        ...packages.map(name => `https://registry.npmjs.org/${encodeURIComponent(name)}/${target}`),
      ])
      for (const readme of readmes) {
        const text = readFileSync(resolve(fixture, readme.path), 'utf8')
        expect(text).toContain(`DeepSeek%20Harness-${target.replaceAll('-', '--')}-5B5BD6`)
        expect(text).toContain(`alt="DeepSeek Harness ${target}"`)
        expect(text).toContain(`${readme.current} \`${target}\``)
        expect(text).toContain(`| ${readme.table} | \`${target}\` |`)
        expect(text).toContain(`| ${readme.adapter} | pnpm \`11.7.0\`; dsh \`${target}\`; GVS=false |`)
        expect(text).toContain(`\n${install(target)}\ndsh plugin --profile tui add ./seektty-1.2.6.tgz\n`)
        expect(text).toContain(`${readme.release}: seektty@1.2.6 / dsh \`${initial}\`.`)
        expect(text).toContain(`\n${install(initial)}\ndsh plugin --profile tui add seektty@1.2.6\n`)
        expect(text).toContain(`[${readme.release}](docs/dsh-${initial}-adaptation.md)`)
        expect(text).toContain(`dsh \`0.1.5-rc.2\` → \`${initial}\`.`)
        expect(text).toContain(`\n${install('0.1.5-rc.2')}\n\`\`\``)
        expect(text).toContain(`[${readme.rollback}](docs/dsh-0.1.5-rc.2-adaptation.md)`)
      }
    }
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

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
