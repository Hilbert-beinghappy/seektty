import { jsx as _jsx } from "react/jsx-runtime";
import { memo, useMemo } from 'react';
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './ChatView.module.css';
/** Subscribe and dispatch one stable Context key without observing sibling Nodes. */
export const ChatNodeSeat = memo(function ChatNodeSeat({ nodeKey, selectedCallId, cwd, openFile, inspectCall, forkAt, loadImage, fileMentions, useSession, renderSlot, t, }) {
    const node = useSession(snapshot => snapshot.chat.nodes.get(nodeKey));
    const routedNode = node;
    const owner = useMemo(() => node === undefined
        ? null
        : {
            selectedCallId,
            cwd,
            openFile,
            inspectCall,
            forkAt,
            loadImage,
            fileMentions,
        }, [node, selectedCallId, cwd, openFile, inspectCall, forkAt, loadImage, fileMentions]);
    if (routedNode === undefined || owner === null)
        return null;
    // Runtime dispatch owns the correlation: every Node's discriminant is the
    // keyed-slot entry passed alongside that same Node. TypeScript does not
    // distribute an object containing a union into a union of objects itself.
    const routedOwner = { ...owner, node: routedNode };
    return (_jsx("div", { className: css.flowItem, "data-chat-anchor-key": routedNode.key, "data-chat-flow-key": routedNode.key, "data-chat-flow-kind": routedNode.kind, children: renderSlot('conversation.chat.node', routedOwner, {
            entryKey: routedNode.kind,
            hookContext: nodeKey,
            fallback: (_jsx(JsonBlock, { label: t('message.unknownSurface', { type: routedNode.kind }), payload: routedNode.data, truncatedLabel: total => t('json.truncated', { total }) })),
        }) }));
});
//# sourceMappingURL=ChatNodeSeat.js.map