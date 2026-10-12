import z from '@deepseek-ai/schemastery'

/** Only declared fields are live; ordinary/unknown profile config remains outside form replacement. */
export function liveKnownFields(schema: z): z {
  const copy = new z(schema.toJSON())
  delete copy.meta.volatile
  for (const child of Object.values(copy.dict ?? {})) child.meta.volatile = true
  return copy
}
