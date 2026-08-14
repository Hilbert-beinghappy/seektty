/**
 * Wrap one contribution in the Engine-owned target envelope.
 *
 * @param context - Context that owns the contribution identity.
 * @param anchorSeq - Sequence used to order the contribution.
 * @param data - Trajectory-specific contribution payload.
 * @returns The contribution wrapped as a Trajectory view node.
 */
export function trajectoryNode(context, anchorSeq, data) {
    return {
        key: context.key,
        kind: context.kind,
        id: context.id,
        target: 'trajectory',
        anchorSeq,
        location: context.start?.location ?? { kind: 'unresolved' },
        data,
    };
}
//# sourceMappingURL=trajectory-definition-common.js.map