import { trajectoryNode } from "./trajectory-definition-common.js";
function requestPrompt(match) {
    if (match.event.type !== 'request/header') {
        throw new Error('trajectory-request-header start requires request/header');
    }
    const header = match.event.data.header;
    const tools = header.tools;
    return {
        config: header.config,
        system: header.system ?? '',
        tools: Array.isArray(tools) ? tools : [],
    };
}
function promptChange(previous, prompt, match) {
    if (match.event.type !== 'request/header')
        return undefined;
    if (previous === undefined && match.event.data.reason !== 'initial')
        return undefined;
    const systemChanged = previous !== undefined && previous.system !== prompt.system;
    const toolsChanged = previous !== undefined
        && JSON.stringify(previous.tools) !== JSON.stringify(prompt.tools);
    if (previous !== undefined && !systemChanged && !toolsChanged)
        return undefined;
    return {
        seq: match.event.seq,
        time: match.event.time,
        kind: previous === undefined
            ? 'initial'
            : systemChanged && toolsChanged
                ? 'system-and-tools'
                : systemChanged ? 'system' : 'tools',
        ...(previous === undefined ? {} : { previous }),
    };
}
const trajectoryRequestHeaderDefinition = {
    kind: 'trajectory-request-header',
    target: 'trajectory',
    match: event => event.type === 'request/header'
        ? { id: String(event.seq), role: 'start' }
        : null,
    start: (_context, match, reader) => {
        const prompt = requestPrompt(match);
        const previous = reader.previous('trajectory-request-header')
            ?.state.prompt;
        const change = promptChange(previous, prompt, match);
        return {
            seq: match.event.seq,
            time: match.event.time,
            prompt,
            location: match.location,
            ...(change === undefined ? {} : { change }),
        };
    },
    update: context => context.state,
    buildViewNode: context => context.state === undefined
        ? null
        : trajectoryNode(context, context.state.seq, {
            kind: 'request-header',
            header: context.state,
        }),
};
/**
 * Register Trajectory request-header facts.
 *
 * @param ctx - Plugin context receiving the Definition.
 */
export function registerTrajectoryRequestHeaderDefinition(ctx) {
    ctx.conversationEvents.register(trajectoryRequestHeaderDefinition);
}
//# sourceMappingURL=trajectory-request-header-definition.js.map