import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const SRC = join(import.meta.dirname, '../src')
const HAN = /\p{Script=Han}/u
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
  'client/composer-draft.ts',
  'client/provider-onboarding.ts',
  'client/surface.ts',
  'client/capabilities.ts',
  'client/transcript.ts',
  'client/actions.ts',
  'client/error-advice.ts',
  'protocol.ts',
]

/** Stable machine marks that must stay Chinese for detectors; never user chrome. */
const MACHINE_MARK_LITERALS = new Set([
  '超时',
  'pnpm 不在 PATH 中；请安装 pnpm 后重试',
])

/** /language input aliases; not rendered chrome. */
const LANGUAGE_ALIAS_LITERALS = new Set(['中文', '英语'])

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : []
  })
}

function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text
  return undefined
}

function importedBindings(source: ts.SourceFile): { readonly ui: ReadonlySet<string>; readonly launcherCopy: ReadonlySet<string> } {
  const ui = new Set<string>()
  const launcherCopy = new Set<string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    const specifier = statement.moduleSpecifier.text
    const fromLocale = /(?:^|\/)locale\.ts$/u.test(specifier)
    const fromCompat = /(?:^|\/)dsh-compat\.ts$/u.test(specifier)
    if (!fromLocale && !fromCompat) continue
    const named = statement.importClause.namedBindings
    if (named === undefined || !ts.isNamedImports(named)) continue
    for (const element of named.elements) {
      const imported = (element.propertyName ?? element.name).text
      const local = element.name.text
      if (fromLocale && imported === 'ui') ui.add(local)
      if (fromCompat && imported === 'launcherCopy') launcherCopy.add(local)
    }
  }
  return { ui, launcherCopy }
}

function isFunctionLike(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node)
}

function isModuleInit(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent
  while (current !== undefined) {
    if (isFunctionLike(current)) return false
    current = current.parent
  }
  return true
}

function isImportedCall(expression: ts.Expression, names: ReadonlySet<string>): boolean {
  return ts.isIdentifier(expression) && names.has(expression.text)
}

function ancestor(node: ts.Node, root: ts.Node): boolean {
  let current: ts.Node | undefined = node
  while (current !== undefined) {
    if (current === root) return true
    current = current.parent
  }
  return false
}

function insideFirstArgOf(node: ts.Node, names: ReadonlySet<string>): boolean {
  let current: ts.Node | undefined = node
  while (current !== undefined) {
    const parent: ts.Node | undefined = current.parent
    if (parent === undefined) return false
    if (ts.isCallExpression(parent) && isImportedCall(parent.expression, names) && parent.arguments[0] === current) {
      return true
    }
    current = parent
  }
  return false
}

function enclosingZhObject(node: ts.Node): ts.ObjectLiteralExpression | undefined {
  let current: ts.Node | undefined = node
  while (current !== undefined) {
    const parent: ts.Node | undefined = current.parent
    if (parent === undefined) return undefined
    if (
      ts.isPropertyAssignment(parent)
      && ts.isIdentifier(parent.name)
      && parent.name.text === 'zh'
      && ts.isObjectLiteralExpression(parent.parent)
    ) {
      return parent.parent
    }
    current = parent
  }
  return undefined
}

function hasEnSibling(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some(property => (
    ts.isPropertyAssignment(property)
    && ts.isIdentifier(property.name)
    && property.name.text === 'en'
  ))
}

function isImmediateZhSelect(object: ts.ObjectLiteralExpression): boolean {
  const parent = object.parent
  return ts.isPropertyAccessExpression(parent)
    && parent.expression === object
    && parent.name.text === 'zh'
}

function isEnglishSelectTernary(node: ts.Node): boolean {
  let current: ts.Node | undefined = node
  while (current !== undefined) {
    const parent: ts.Node | undefined = current.parent
    if (parent !== undefined && ts.isConditionalExpression(parent) && ts.isIdentifier(parent.condition) && parent.condition.text === 'english') {
      return ancestor(node, parent.whenTrue) || ancestor(node, parent.whenFalse)
    }
    current = parent
  }
  return false
}

function isLanguageAliasLiteral(relativePath: string, node: ts.Node, text: string): boolean {
  if (relativePath !== 'client/actions.ts' || !ts.isStringLiteral(node) || !LANGUAGE_ALIAS_LITERALS.has(text)) {
    return false
  }
  return enclosingZhObject(node) === undefined
}

function report(relativePath: string, source: ts.SourceFile, node: ts.Node, text: string): string {
  return `${relativePath}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}:${text.slice(0, 60)}`
}

/**
 * Chinese in gated files must come from an imported `ui`/`launcherCopy` binding,
 * a paired `{zh,en}` record selected at the use site, or a precise machine mark.
 */
export function analyzeSource(relativePath: string, sourceText: string): readonly string[] {
  const source = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const bindings = importedBindings(source)
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isImportedCall(node.expression, bindings.ui) && isModuleInit(node)) {
      found.push(report(relativePath, source, node, 'module-init ui()'))
    }
    const text = literalText(node)
    if (text !== undefined && HAN.test(text)) {
      if (isLanguageAliasLiteral(relativePath, node, text)) {
        ts.forEachChild(node, visit)
        return
      }
      if (insideFirstArgOf(node, bindings.ui) || insideFirstArgOf(node, bindings.launcherCopy)) {
        ts.forEachChild(node, visit)
        return
      }
      if (relativePath === 'dsh-compat.ts' && isEnglishSelectTernary(node)) {
        ts.forEachChild(node, visit)
        return
      }
      const object = enclosingZhObject(node)
      if (object !== undefined && hasEnSibling(object)) {
        if (isImmediateZhSelect(object) && !MACHINE_MARK_LITERALS.has(text)) {
          found.push(report(relativePath, source, node, text))
        }
        ts.forEachChild(node, visit)
        return
      }
      found.push(report(relativePath, source, node, text))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('i18n AST gate fixtures (review #54)', () => {
  it('rejects property-access .ui() that is not the imported binding', () => {
    expect(analyzeSource('client/fake.ts', `
import { ui } from './locale.ts'
const helper = { ui: (zh: string) => zh }
helper.ui('中文冻结')
`)).not.toEqual([])
  })

  it('rejects unpaired { zh } object literals', () => {
    expect(analyzeSource('protocol.ts', `
export const frozen = { zh: '设置冲突' }.zh
`)).not.toEqual([])
  })

  it('rejects arbitrary ternaries in dsh-compat.ts', () => {
    expect(analyzeSource('dsh-compat.ts', `
export function pick(flag: boolean): string {
  return flag ? '中文旁路' : 'other'
}
`)).not.toEqual([])
  })

  it('rejects module-init ui() that freezes the boot locale', () => {
    expect(analyzeSource('client/theme-config.ts', `
import { ui } from './locale.ts'
export const NAME = ui('DeepSeek 暗色', 'DeepSeek dark')
`)).not.toEqual([])
  })

  it('allows imported ui() inside a function or getter and paired {zh,en} catalogs', () => {
    expect(analyzeSource('client/empty-examples.ts', `
import { ui } from './locale.ts'
export const ROW = { zh: '审查当前改动', en: 'Review the current changes' }
export function text(): string { return ui(ROW.zh, ROW.en) }
export const theme = { get name() { return ui('DeepSeek 暗色', 'DeepSeek dark') } }
`)).toEqual([])
  })

  it('allows the startup-timeout and pnpm PATH machine marks', () => {
    expect(analyzeSource('client/error-advice.ts', `
const STARTUP_TIMEOUT = { zh: '超时', en: 'timed out' } as const
export const STARTUP_TIMEOUT_MARK = STARTUP_TIMEOUT.zh
`)).toEqual([])
    expect(analyzeSource('host/profile-plugin-manager.ts', `
function warn(): string {
  return ({ zh: 'pnpm 不在 PATH 中；请安装 pnpm 后重试', en: 'pnpm is not on PATH; install pnpm and retry' }).zh
}
`)).toEqual([])
  })

  it('allows bare /language aliases but still rejects { zh }.zh freezes in actions.ts', () => {
    expect(analyzeSource('client/actions.ts', `
const aliases = new Map([['中文', 'zh'], ['英语', 'en']])
`)).toEqual([])
    expect(analyzeSource('client/actions.ts', `
const aliases = new Map([[{ zh: '中文' }.zh, 'zh']])
`)).not.toEqual([])
  })

  it('allows launcherCopy and english ? en : zh in dsh-compat.ts', () => {
    expect(analyzeSource('dsh-compat.ts', `
export function launcherCopy(zh: string, en: string, english: boolean): string {
  return english ? en : zh
}
export function message(english: boolean): string {
  return english ? 'too old' : 'dsh 过旧'
}
`)).toEqual([])
  })
})

describe('i18n AST gate (task 7)', () => {
  it('keeps Chinese literals in gated files on imported ui/launcherCopy or paired {zh,en}', () => {
    const gated = new Set(GATED.map(file => join(SRC, file)))
    const files = walk(SRC).filter(path => gated.has(path))
    expect(files).toHaveLength(GATED.length)
    expect(files.flatMap(path => analyzeSource(relative(SRC, path), readFileSync(path, 'utf8')))).toEqual([])
  })
})
