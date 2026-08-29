import { describe, expect, it } from 'vitest'
import {
  PNPM_GVS_CONFIG_ARG,
  dshPluginArgs,
  dshPluginCommand,
  isKnownPnpmGvsLoaderFailure,
  isPnpmGlobalVirtualStorePath,
  mutatesPnpmPackageTree,
  pnpmCommand,
  pnpmGvsRecoveryAdvice,
  redactPnpmCommandArgument,
  withPnpmGvsCompatibility,
} from '../src/pnpm-compat.ts'

describe('pnpm 11 Global Virtual Store compatibility', () => {
  it.each(['add', 'install', 'remove', 'rm', 'uninstall', 'update', 'up'])(
    'applies the per-invocation option to pnpm %s',
    (command) => {
      expect(mutatesPnpmPackageTree([command])).toBe(true)
      expect(withPnpmGvsCompatibility([command, 'seektty'])).toEqual([
        command,
        PNPM_GVS_CONFIG_ARG,
        'seektty',
      ])
    },
  )

  it('does not alter read-only pnpm commands', () => {
    expect(withPnpmGvsCompatibility(['--version'])).toEqual(['--version'])
    expect(withPnpmGvsCompatibility(['list', '--depth', '0'])).toEqual(['list', '--depth', '0'])
  })

  it('normalizes an incompatible caller override without duplicating the option', () => {
    expect(withPnpmGvsCompatibility([
      'add',
      '--config.enable-global-virtual-store=true',
      '--save-exact',
      'seektty',
    ])).toEqual(['add', PNPM_GVS_CONFIG_ARG, '--save-exact', 'seektty'])
    expect(withPnpmGvsCompatibility(['add', '--global', 'seektty'])).toEqual([
      'add',
      '--global',
      PNPM_GVS_CONFIG_ARG,
      'seektty',
    ])
  })

  it('builds native dsh plugin commands with the same policy', () => {
    expect(dshPluginArgs('team', ['add', 'file:../seektty.tgz'])).toEqual([
      'plugin',
      '--profile',
      'team',
      'add',
      PNPM_GVS_CONFIG_ARG,
      'file:../seektty.tgz',
    ])
    expect(dshPluginCommand('team', ['remove', 'seektty'])).toBe(
      `dsh plugin --profile team remove ${PNPM_GVS_CONFIG_ARG} seektty`,
    )
    expect(pnpmCommand(['add', '--global', '@deepseek-ai/dsh@0.1.1-rc.2'])).toBe(
      `pnpm add --global ${PNPM_GVS_CONFIG_ARG} @deepseek-ai/dsh@0.1.1-rc.2`,
    )
  })

  it.each([
    String.raw`C:\pnpm\store\v11\links\ab\package`,
    '/home/user/.local/share/pnpm/store/v11/links/ab/package',
  ])('recognizes a GVS link-tree path: %s', (path) => {
    expect(isPnpmGlobalVirtualStorePath(path)).toBe(true)
  })

  it('requires both the GVS path and a Cordis loader signature', () => {
    const known = String.raw`Plugin tree failed to load: cordis:include from C:\pnpm\store\v11\links\ab\node_modules\seektty`
    expect(isKnownPnpmGvsLoaderFailure(known)).toBe(true)
    expect(isKnownPnpmGvsLoaderFailure('Plugin tree failed to load: ordinary path')).toBe(false)
    expect(isKnownPnpmGvsLoaderFailure('/pnpm/store/v11/links/ab: unrelated build failure')).toBe(false)
  })

  it('provides bilingual, per-command recovery without global configuration changes', () => {
    const common = {
      profile: 'tui',
      dshSpec: '@deepseek-ai/dsh@0.1.1-rc.2',
      pluginSpec: 'seektty@1.2.4',
    }
    const zh = pnpmGvsRecoveryAdvice({ ...common, english: false })
    const en = pnpmGvsRecoveryAdvice({ ...common, english: true })
    expect(zh).toContain('Global Virtual Store')
    expect(zh).toContain(PNPM_GVS_CONFIG_ARG)
    expect(en).toContain('per-command')
    expect(en).not.toContain('pnpm config set')
  })

  it('redacts credentials from displayed and recovery commands', () => {
    const secret = 'https://user:password@example.com/seektty.tgz?token=top-secret&channel=stable'
    expect(redactPnpmCommandArgument(secret)).toContain('***')
    const displayed = pnpmCommand(['add', secret])
    expect(displayed).not.toContain('user')
    expect(displayed).not.toContain('password')
    expect(displayed).not.toContain('top-secret')
    expect(displayed).toContain('channel=stable')
  })
})
