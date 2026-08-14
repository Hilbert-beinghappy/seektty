/**
 * Resolve a workspace-relative path into the Host-facing spelling used by openPath.
 * @param cwd - session workspace root, when known.
 * @param path - absolute or workspace-relative path.
 * @returns an absolute path when a workspace root is available, otherwise the original path.
 */
export function resolveWorkspacePath(cwd, path) {
    if (path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\'))
        return path;
    if (cwd === undefined || cwd === '')
        return path;
    const base = cwd.replace(/[/\\]+$/, '');
    const rel = path.replace(/^[/\\]+/, '');
    return `${base}/${rel}`;
}
//# sourceMappingURL=path.js.map