/**
 * Schema introspection and draft-editing helpers behind settings editors.
 * The serialized schemastery envelope (`schema.toJSON()`) rehydrates into a
 * live validator whose node relations (`dict`/`inner`) editors probe for
 * field presence and roles; drafts are edited immutably by path.
 * @module @deepseek-ai/dsh-client-schema-form/model
 */
import Schema from '@deepseek-ai/schemastery';
/** Live schemastery node; the renderer reads only its structural relations. */
export type SchemaNode = Schema;
/**
 * Rehydrate a serialized schema envelope into a live validator/node tree.
 * @param serialized - `schema.toJSON()` output received over the wire.
 * @returns the root schema node.
 */
export declare function rehydrateSchema(serialized: unknown): SchemaNode;
/**
 * Validate a draft against a rehydrated schema.
 * @param schema - rehydrated root node.
 * @param draft - candidate value.
 * @returns the validation failure message, or `undefined` when the draft passes.
 */
export declare function validateDraft(schema: SchemaNode, draft: unknown): string | undefined;
/**
 * Resolve the schema node at a settings path (the configurable-provider
 * directory's `settingsPath` vocabulary): object properties by name, dict
 * entries through `inner`. An unresolvable segment returns `undefined` so
 * the caller falls back instead of rendering a wrong subtree.
 * @param root - rehydrated section root node.
 * @param path - key path from the section root.
 * @returns the node describing that position, or `undefined`.
 */
export declare function nodeAtPath(root: SchemaNode, path: readonly string[]): SchemaNode | undefined;
/**
 * Read a nested value by path.
 * @param value - root value (draft or fallback layer).
 * @param path - key path from the root; array indexes as strings.
 * @returns the value at the path, or `undefined` along a missing branch.
 */
export declare function getPath(value: unknown, path: readonly string[]): unknown;
/**
 * Whether a draft explicitly carries the path (its presence marks a user
 * override, independent of the value stored there).
 * @param value - root value (draft or fallback layer).
 * @param path - key path from the root; array indexes as strings.
 * @returns whether the path's final key exists on its parent.
 */
export declare function hasPath(value: unknown, path: readonly string[]): boolean;
/**
 * Immutably set a nested value, materializing missing intermediate containers.
 * @param root - draft root (never mutated).
 * @param path - non-empty key path.
 * @param value - value to store at the path.
 * @returns the new draft root.
 */
export declare function setPath(root: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown>;
/**
 * Immutably remove a nested key (the per-field reset: the resolved value
 * falls back to the composition base and schema defaults). Removing along a
 * missing branch returns the root unchanged.
 * @param root - draft root (never mutated).
 * @param path - non-empty key path.
 * @returns the new draft root.
 */
export declare function deletePath(root: Record<string, unknown>, path: readonly string[]): Record<string, unknown>;
//# sourceMappingURL=model.d.ts.map