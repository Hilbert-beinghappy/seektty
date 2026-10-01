/** Synthetic codecs mirroring the five published rc.2 descriptors; verified against the unchanged tarball. */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import type { HostFileMethod } from '../../src/client/host-file-controller.ts'
const pkg = '@deepseek-ai/dsh-api-workspace-files', types = `${pkg}/types#`
const stat = z.object({ absolutePath: z.string(), version: z.string(), bytes: z.number().optional() })
const resultSchemas = {
  stat,
  read: stat.extend({ offset: z.number(), text: z.string(), lines: z.number(), eof: z.boolean() }),
  readBytes: stat.extend({ offset: z.number(), data: z.instanceof(Uint8Array), eof: z.boolean() }),
  list: z.object({ path: z.string(), entries: z.array(z.object({ name: z.string(), type: z.enum(['file', 'directory', 'other']), size: z.number().optional() })), truncated: z.boolean() }),
  changes: z.union([z.object({ kind: z.literal('ready') }), z.object({ kind: z.literal('change'), change: z.union([z.object({ absolutePath: z.string(), version: z.string() }), z.object({ absolutePath: z.string(), absent: z.literal(true) })]) })]),
}
const resultNames = { stat: 'WorkspaceFileStat', read: 'WorkspaceFileText', readBytes: 'WorkspaceFileBytes', list: 'WorkspaceDirectoryListing', changes: 'WorkspaceFileWatchFrame' }
export function workspaceDescriptor(method: HostFileMethod): InvocationDescriptor {
  const schema = resultSchemas[method]
  return { id: `${pkg}#workspaceFiles/${method}`, service: 'workspaceFiles', namespace: 'workspaceFiles', method, invocation: { kind: 'direct' },
    ...(method === 'changes' ? { mode: 'stream' as const } : {}), cancellation: { parameter: 'signal' },
    parameters: [
      { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope', codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => z.string() } },
      { name: 'path', wire: 'path', source: 'json', codec: { mode: 'strict', typeSymbol: `${pkg}#workspaceFiles/${method}:path`, create: () => z.string() } },
      ...(method === 'read' ? [{ name: 'range', wire: 'range', source: 'json' as const, codec: { mode: 'strict' as const, typeSymbol: `${types}WorkspaceFileRange`, create: () => z.object({ offset: z.number().optional(), limit: z.number().optional() }) } }] : []),
      ...(method === 'readBytes' ? [{ name: 'options', wire: 'options', source: 'json' as const, codec: { mode: 'strict' as const, typeSymbol: `${types}WorkspaceByteReadOptions`, create: () => z.object({ range: z.object({ offset: z.number().optional(), length: z.number().optional() }).optional(), baseFile: z.string().optional() }) } }] : []),
    ], result: { mode: 'strict', typeSymbol: `${types}${resultNames[method]}`, create: () => schema,
      ...(method === 'readBytes' ? { decode: (value: unknown) => schema.parse(value), encode: (value: unknown) => value } : {}) },
  }
}
