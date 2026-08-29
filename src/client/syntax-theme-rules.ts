/** Shared TextMate selectors for built-in and legacy role-based syntax themes. */

import type {
  TuiSyntaxThemeColors,
  TuiTextMateRule,
  TuiThemeUiColors,
} from '@deepseek-ai/dsh-tui-protocol'

type SyntaxRole = Exclude<keyof TuiSyntaxThemeColors, 'background' | 'foreground'>

/**
 * Representative scopes used when deriving the compact role palette from an imported theme.
 * These are selectors, not a replacement grammar: Shiki still owns language tokenization.
 */
export const SYNTAX_ROLE_SCOPES: Readonly<Record<SyntaxRole, readonly string[]>> = {
  comment: ['comment'],
  keyword: ['keyword.control', 'keyword.other', 'keyword', 'storage.type', 'storage.modifier'],
  string: ['string.quoted', 'string.template', 'string.unquoted', 'string'],
  number: ['constant.numeric'],
  constant: ['constant.language', 'constant.character', 'constant.other', 'constant', 'variable.language'],
  function: ['entity.name.function', 'support.function', 'variable.function'],
  type: [
    'entity.name.type', 'entity.name.class', 'entity.name.interface', 'entity.name.enum',
    'entity.name.struct', 'entity.name.namespace', 'support.type', 'support.class',
  ],
  variable: ['variable.other', 'variable.language', 'variable'],
  property: [
    'variable.other.property', 'variable.other.object.property', 'support.variable.property',
    'support.type.property-name',
  ],
  parameter: ['variable.parameter'],
  operator: ['keyword.operator'],
  punctuation: ['punctuation'],
  tag: ['entity.name.tag'],
  attribute: ['entity.other.attribute-name', 'meta.decorator', 'meta.annotation'],
  regexp: ['string.regexp'],
}

function foreground(
  scope: readonly string[],
  color: string,
  fontStyle?: TuiTextMateRule['fontStyle'],
): TuiTextMateRule {
  return {
    scope,
    foreground: color,
    ...(fontStyle === undefined ? {} : { fontStyle }),
  }
}

/**
 * Build a complete, ordered TextMate theme from SeekTTY's compact syntax palette.
 *
 * The order is deliberately broad-to-specific. TextMate selector specificity remains
 * authoritative, while equal-specificity special cases later in the list can refine
 * a general role. Parent meta scopes are never colored on their own, which prevents
 * a function-call container from swallowing argument, punctuation, and string colors.
 */
export function visualTextMateRules(
  syntax: TuiSyntaxThemeColors,
  colors: Pick<TuiThemeUiColors, 'accent' | 'success' | 'danger'>,
): readonly TuiTextMateRule[] {
  return [
    foreground(['comment', 'punctuation.definition.comment'], syntax.comment),
    foreground([
      'punctuation', 'meta.brace', 'meta.delimiter',
      'punctuation.definition.tag', 'punctuation.definition.string',
    ], syntax.punctuation),

    foreground(['variable', 'variable.other', 'variable.language'], syntax.variable),
    foreground([
      'variable.other.property', 'variable.other.object.property', 'support.variable.property',
      'support.type.property-name', 'meta.object-literal.key', 'meta.mapping.key',
    ], syntax.property),
    foreground(['variable.parameter', 'meta.function.parameters variable'], syntax.parameter),

    foreground(['keyword', 'keyword.control', 'keyword.other', 'storage.type', 'storage.modifier'], syntax.keyword),
    foreground(['keyword.operator', 'punctuation.separator.key-value'], syntax.operator),

    foreground(['string', 'string.quoted', 'string.template', 'string.unquoted'], syntax.string),
    foreground(['constant.character.escape', 'constant.other.placeholder'], syntax.constant),
    foreground([
      'string.regexp', 'constant.other.character-class.regexp', 'constant.character.escape.regexp',
      'keyword.operator.quantifier.regexp', 'punctuation.definition.character-class.regexp',
    ], syntax.regexp),

    foreground(['constant', 'constant.language', 'constant.character', 'constant.other', 'variable.language'], syntax.constant),
    foreground(['constant.numeric'], syntax.number),

    foreground([
      'entity.name.type', 'entity.name.class', 'entity.name.interface', 'entity.name.enum',
      'entity.name.struct', 'entity.name.union', 'entity.name.namespace',
      'support.type', 'support.class', 'support.other.namespace', 'storage.type.primitive',
    ], syntax.type),
    foreground([
      'entity.name.function', 'support.function', 'variable.function',
      'meta.function-call entity.name.function', 'meta.function-call variable.function',
    ], syntax.function),

    foreground(['entity.name.tag'], syntax.tag),
    foreground([
      'entity.other.attribute-name', 'entity.other.attribute-name.class',
      'entity.other.attribute-name.id', 'meta.decorator', 'meta.annotation',
      'punctuation.decorator',
    ], syntax.attribute),

    foreground(['markup.heading', 'entity.name.section'], syntax.keyword, ['bold']),
    foreground(['markup.bold'], syntax.foreground, ['bold']),
    foreground(['markup.italic'], syntax.foreground, ['italic']),
    foreground(['markup.strikethrough'], syntax.foreground, ['strikethrough']),
    foreground(['markup.inline.raw', 'markup.fenced_code.block'], syntax.string),
    foreground(['markup.underline.link', 'string.other.link'], syntax.function),
    foreground(['markup.quote', 'punctuation.definition.quote'], syntax.comment),

    foreground(['markup.inserted', 'punctuation.definition.inserted'], colors.success),
    foreground(['markup.deleted', 'punctuation.definition.deleted'], colors.danger),
    foreground(['meta.diff.header', 'meta.diff.range'], colors.accent),
  ]
}
