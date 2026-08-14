/**
 * Derive the visible command line from its structured durable run.
 * @param event - `/goal` command run.
 * @returns command text with trailing parser whitespace removed.
 */
export function goalCommandText(event) {
    return `/${event.data.name}${(event.data.args ?? '').trimEnd()}`;
}
/** Goal-owned command input projection; the generic command Definition retains the result row. */
export const goalCommandInputDefinition = {
    kind: 'goal-command-input',
    target: 'chat',
    match: event => event.type === 'command/run' && event.data.name === 'goal'
        ? { id: String(event.data.commandId), role: 'start' }
        : null,
    start: (_context, match) => {
        if (match.event.type !== 'command/run') {
            throw new Error('goal-command-input start requires command/run');
        }
        return {
            commandId: match.event.data.commandId,
            seq: match.event.seq,
            time: match.event.time,
            text: goalCommandText(match.event),
        };
    },
    update: context => context.state,
    buildViewNode: (context) => {
        if (context.state === undefined)
            return null;
        return {
            key: context.key,
            kind: 'command-input',
            id: context.id,
            target: 'chat',
            anchorSeq: context.state.seq - 0.1,
            location: context.start?.location ?? { kind: 'unresolved' },
            visibility: 'visible',
            data: {
                commandId: context.state.commandId,
                text: context.state.text,
                time: context.state.time,
            },
        };
    },
};
//# sourceMappingURL=goal-command-input.js.map