/** Register runtime validation rather than serializing a callback's module closure. */
import z from '@deepseek-ai/schemastery'
import { keyBindingsIssue, sanitizeKeyBindings } from '../client/keymap.ts'

const TYPE = 'seektty-key-bindings-v1'
z.extend(TYPE, (data, schema, options) => {
  if (schema.inner === undefined) throw new Error('Key binding schema is missing its dictionary')
  const [value, adapted] = z.resolve(data, schema.inner, options)
  const issue = keyBindingsIssue(value)
  if (issue !== undefined) throw new Error(issue)
  return [sanitizeKeyBindings(value), adapted]
})

/** Schemastery JSON carries only the type and dictionary; the resolver stays in this module. */
export function keyBindingsSchema(): z<Readonly<Record<string, string>>> {
  return new z<Readonly<Record<string, string>>>({ type: TYPE, inner: z.dict(z.string()) })
}
