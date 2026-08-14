// Context source projection: the role and the human-facing producer name
// of one logged non-user `user/message`, read from its durable `source` alone.
// The client keeps no table of known plugin ids — a renamed or newly mounted
// producer must never need a client release to stay identifiable, and a resumed
// or foreign log must project the same way as a live one.
/** One durable source narrowed to the readable-record shape; null for anything else. */
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : null;
}
/** A record field read as a non-empty string, or null. */
function readString(record, key) {
    const value = record[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
}
/** Distinct non-empty `field` values of an array-valued source member, in first-seen order. */
function collect(source, member, field) {
    const list = source[member];
    if (!Array.isArray(list))
        return [];
    const seen = [];
    for (const entry of list) {
        const record = asRecord(entry);
        const value = record === null ? null : readString(record, field);
        if (value !== null && !seen.includes(value))
            seen.push(value);
    }
    return seen;
}
/** A collected name list rendered as one label; null when the list is empty. */
function joined(names) {
    return names.length > 0 ? names.join(', ') : null;
}
/**
 * Project one durable message source onto its transcript role and producer name.
 *
 * The source arrives over the wire as opaque JSON (`MessageSource` is
 * merge-extensible, so no client-side union can be exhaustive), and a durable
 * log may predate or postdate this UI; every unreadable shape therefore
 * degrades to `inject` with whatever name the record still carries.
 * @param source - the logged `user/message` source, exactly as recorded.
 * @returns the role and producer name to present for this context.
 */
export function contextProvenance(source) {
    const record = asRecord(source);
    const kind = record === null ? null : readString(record, 'kind');
    if (record === null || kind === null)
        return { role: 'inject', label: null };
    switch (kind) {
        // Cross-session snapshots are the one durable source that carries another
        // session's material; its references name the sessions they were read from.
        case 'session-reference':
            return { role: 'recall', label: joined(collect(record, 'references', 'label')) ?? kind };
        // Workspace instructions name the files they were reconciled from, which
        // identifies the producer far better than the plugin id would.
        case 'agent-instructions':
            return { role: 'inject', label: joined(collect(record, 'changes', 'path')) ?? kind };
        case 'plugin':
            return { role: 'inject', label: readString(record, 'plugin') ?? kind };
        // A user-explicit skill invocation names the skill it injected.
        case 'skill-invocation':
            return { role: 'inject', label: readString(record, 'name') ?? kind };
        // Documented default arm of the merge-extensible source map: an unknown
        // producer still identifies itself by its own durable kind.
        default:
            return { role: 'inject', label: kind };
    }
}
/**
 * Context forms this UI version renders with a dedicated presentation. The
 * durable vocabulary (`ContextForm` in `dsh-llm`) may already be wider — an
 * unrecognized or absent value degrades to the opaque presentation rather than
 * dropping the row, so a log written by a newer or foreign producer still
 * renders.
 */
const KNOWN_FORMS = ['instructions', 'catalog', 'snapshot', 'notice', 'relay', 'recall'];
/**
 * Read the producer-declared form off one durable message source.
 * @param source - the logged `user/message` source, exactly as recorded.
 * @returns the form when this UI version presents it, otherwise null (opaque).
 */
export function contextForm(source) {
    const record = asRecord(source);
    const form = record === null ? null : readString(record, 'form');
    return form !== null && KNOWN_FORMS.includes(form)
        ? form
        : null;
}
//# sourceMappingURL=context-provenance.js.map