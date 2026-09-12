import Schema from "@deepseek-ai/schemastery";
//#region lib/types/model.js
/**
* Schema introspection and draft-editing helpers behind settings editors.
* The serialized schemastery envelope (`schema.toJSON()`) rehydrates into a
* live validator whose node relations (`dict`/`inner`) editors probe for
* field presence and roles; drafts are edited immutably by path.
* @module @deepseek-ai/dsh-client-schema-form/model
*/
/**
* Rehydrate a serialized schema envelope into a live validator/node tree.
* @param serialized - `schema.toJSON()` output received over the wire.
* @returns the root schema node.
*/
function rehydrateSchema(serialized) {
	return new Schema(serialized);
}
/**
* Validate a draft against a rehydrated schema.
* @param schema - rehydrated root node.
* @param draft - candidate value.
* @returns the validation failure message, or `undefined` when the draft passes.
*/
function validateDraft(schema, draft) {
	try {
		schema(draft);
		return;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}
/**
* Resolve the schema node at a settings path (the configurable-provider
* directory's `settingsPath` vocabulary): object properties by name, dict
* entries through `inner`. An unresolvable segment returns `undefined` so
* the caller falls back instead of rendering a wrong subtree.
* @param root - rehydrated section root node.
* @param path - key path from the section root.
* @returns the node describing that position, or `undefined`.
*/
function nodeAtPath(root, path) {
	let node = root;
	for (const key of path) {
		if (node === void 0) return void 0;
		if (node.type === "object") node = node.dict?.[key];
		else if (node.type === "dict" || node.type === "array") node = node.inner;
		else return void 0;
	}
	return node;
}
/**
* Read a nested value by path.
* @param value - root value (draft or fallback layer).
* @param path - key path from the root; array indexes as strings.
* @returns the value at the path, or `undefined` along a missing branch.
*/
function getPath(value, path) {
	let current = value;
	for (const key of path) {
		if (Array.isArray(current)) {
			current = current[Number(key)];
			continue;
		}
		if (typeof current !== "object" || current === null) return void 0;
		current = current[key];
	}
	return current;
}
/**
* Whether a draft explicitly carries the path (its presence marks a user
* override, independent of the value stored there).
* @param value - root value (draft or fallback layer).
* @param path - key path from the root; array indexes as strings.
* @returns whether the path's final key exists on its parent.
*/
function hasPath(value, path) {
	if (path.length === 0) return value !== void 0;
	const parent = getPath(value, path.slice(0, -1));
	const key = path[path.length - 1];
	if (Array.isArray(parent)) return Number(key) < parent.length;
	if (typeof parent !== "object" || parent === null) return false;
	return key in parent;
}
function cloneContainer(container, key) {
	if (Array.isArray(container)) return [...container];
	if (typeof container === "object" && container !== null) return { ...container };
	return /^\d+$/.test(key) ? [] : {};
}
/** Clone the container spine down to the leaf's parent, materializing missing intermediates. */
function cloneSpine(root, path) {
	const result = { ...root };
	let target = result;
	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i];
		const child = cloneContainer(Array.isArray(target) ? target[Number(key)] : target[key], path[i + 1]);
		if (Array.isArray(target)) target[Number(key)] = child;
		else target[key] = child;
		target = child;
	}
	return {
		result,
		parent: target,
		leaf: path[path.length - 1]
	};
}
/**
* Immutably set a nested value, materializing missing intermediate containers.
* @param root - draft root (never mutated).
* @param path - non-empty key path.
* @param value - value to store at the path.
* @returns the new draft root.
*/
function setPath(root, path, value) {
	if (path.length === 0) throw new Error("schema-form: setPath needs a non-empty path");
	const { result, parent, leaf } = cloneSpine(root, path);
	if (Array.isArray(parent)) parent[Number(leaf)] = value;
	else parent[leaf] = value;
	return result;
}
/**
* Immutably remove a nested key (the per-field reset: the resolved value
* falls back to the composition base and schema defaults). Removing along a
* missing branch returns the root unchanged.
* @param root - draft root (never mutated).
* @param path - non-empty key path.
* @returns the new draft root.
*/
function deletePath(root, path) {
	if (path.length === 0) throw new Error("schema-form: deletePath needs a non-empty path");
	if (!hasPath(root, path)) return root;
	const { result, parent, leaf } = cloneSpine(root, path);
	if (Array.isArray(parent)) parent.splice(Number(leaf), 1);
	else Reflect.deleteProperty(parent, leaf);
	return result;
}
//#endregion
export { deletePath, getPath, hasPath, nodeAtPath, rehydrateSchema, setPath, validateDraft };
