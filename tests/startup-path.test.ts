import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { measureStartup, measureStartupSync, startupTraceEnabled } from '../src/startup-trace.ts'

const root = resolve(import.meta.dirname, '..')

describe('startup path (task 5.1)', () => {
  it('does not force Shiki to compile every long regex at boot', () => {
    const source = readFileSync(resolve(root, 'src/client/syntax-highlighter.ts'), 'utf8')
    expect(source).not.toMatch(/lazyCompileLength:\s*Number\.POSITIVE_INFINITY/u)
  })

  it('does not await syntax highlighter creation before the first TUI frame', () => {
    const source = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(source).not.toMatch(/const syntax = await SyntaxHighlighter\.create/u)
    expect(source).toMatch(/void SyntaxHighlighter\.create/u)
  })

  it('mounts the first three client plugins in parallel before runtime', () => {
    const source = readFileSync(resolve(root, 'src/client/client-runtime.ts'), 'utf8')
    expect(source).toMatch(/Promise\.all\(\[[\s\S]*registryPlugin[\s\S]*gatewayPlugin[\s\S]*remotesPlugin[\s\S]*\]\)/u)
    expect(source).toMatch(/await ctx\.plugin\(runtimePlugin/u)
  })

  it('loads settings.describe in parallel with startClient', () => {
    const source = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(source).toMatch(/Promise\.all\(\[[\s\S]*settings\.describe\(\)[\s\S]*startClient/u)
  })

  it('reads the Profile manifest once for both legacy and current plugin checks', () => {
    const source = readFileSync(resolve(root, 'src/bin.ts'), 'utf8')
    expect([...source.matchAll(/readFileSync\(manifestPath/gu)]).toHaveLength(1)
  })
})

describe('SEEKTTY_STARTUP_TRACE', () => {
  it('is off unless the env flag is 1', () => {
    expect(startupTraceEnabled({})).toBe(false)
    expect(startupTraceEnabled({ SEEKTTY_STARTUP_TRACE: '0' })).toBe(false)
    expect(startupTraceEnabled({ SEEKTTY_STARTUP_TRACE: '1' })).toBe(true)
  })

  it('prints stage milliseconds to stderr when enabled', async () => {
    const lines: string[] = []
    const result = await measureStartup('shiki', async () => {
      await Promise.resolve()
      return 7
    }, { SEEKTTY_STARTUP_TRACE: '1' }, chunk => { lines.push(chunk) })
    expect(result).toBe(7)
    expect(lines.join('')).toMatch(/^seektty-startup shiki \d+ ms\n$/u)
  })

  it('does not print when disabled', async () => {
    const lines: string[] = []
    await measureStartup('shiki', () => 1, {}, chunk => { lines.push(chunk) })
    expect(lines).toEqual([])
  })

  it('prints the same line from the synchronous launcher helper', () => {
    const lines: string[] = []
    expect(measureStartupSync('launcher-manifest', () => 3, { SEEKTTY_STARTUP_TRACE: '1' }, chunk => {
      lines.push(chunk)
    })).toBe(3)
    expect(lines.join('')).toMatch(/^seektty-startup launcher-manifest \d+ ms\n$/u)
  })
})
