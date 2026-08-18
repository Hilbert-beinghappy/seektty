import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const SRC = join(import.meta.dirname, '../src')
const HAN = /[\u4e00-\u9fff]/u
const GATED = [
  'bin.ts',
  'dsh-compat.ts',
  'client/overlays.ts',
  'client/behavior.ts',
  'client/clipboard.ts',
  'client/desktop-notify.ts',
  'client/job-control.ts',
  'client/theme.ts',
  'client/help.ts',
  'client/empty-examples.ts',
  'client/keymap.ts',
  'client/tool-output-limit.ts',
  'client/relative-time.ts',
  'client/chrome.ts',
  'client/trajectory-detail.ts',
  'client/appearance.ts',
  'client/client-runtime.ts',
  'client/settings.ts',
  'host/index.ts',
  'host/restart-handoff.ts',
  'host/startup.ts',
  'host/plugin-marketplace.ts',
  'host/marketplace-provider.ts',
  'host/profile-plugin-manager.ts',
  'host/management.ts',
  'client/theme-config.ts',
  'client/theme-import.ts',
  'client/surface.ts',
]

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : []
  })
}

function callName(node: ts.CallExpression): string | undefined {
  const expression = node.expression
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return undefined
}

function insideAllowedCall(node: ts.Node): boolean {
  let current: ts.Node | undefined = node
  while (current !== undefined) {
    const parent: ts.Node | undefined = current.parent as ts.Node | undefined
    if (parent === undefined) return false
    if (ts.isCallExpression(parent)) {
      const name = callName(parent)
      if ((name === 'ui' || name === 'launcherCopy') && parent.arguments[0] === current) return true
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && parent.name.text === 'zh') {
      return true
    }
    current = parent
  }
  return false
}

function englishTernary(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent as ts.Node | undefined
  while (current !== undefined) {
    if (ts.isConditionalExpression(current)) return true
    current = current.parent as ts.Node | undefined
  }
  return false
}

function chineseLiterals(path: string): readonly string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    const text = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      ? node.text
      : ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
        ? node.text
        : undefined
    if (text !== undefined && HAN.test(text) && !insideAllowedCall(node)) {
      if (relative(SRC, path) === 'dsh-compat.ts' && englishTernary(node)) {
        ts.forEachChild(node, visit)
        return
      }
      found.push(`${relative(SRC, path)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}:${text.slice(0, 60)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('i18n AST gate (task 7)', () => {
  it('keeps Chinese literals in gated files as ui/launcherCopy first arguments', () => {
    const gated = new Set(GATED.map(file => join(SRC, file)))
    const files = walk(SRC).filter(path => gated.has(path))
    expect(files).toHaveLength(GATED.length)
    expect(files.flatMap(chineseLiterals)).toEqual([])
  })
})
