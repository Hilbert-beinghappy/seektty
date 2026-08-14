/**
 * Index every subagent descendant under each ancestor it reaches through an
 * uninterrupted subagent-origin chain. Cycles fail soft and orphan owners
 * remain harmless map keys until their summaries arrive.
 * @param summaries - retained session summaries keyed by id.
 * @returns descendant totals and running totals keyed by possible parent id.
 */
export function indexSubagentDescendants(summaries) {
    const indexed = new Map();
    for (const descendant of Object.values(summaries)) {
        if (descendant.origin !== 'subagent')
            continue;
        const seen = new Set();
        let current = descendant;
        while (current?.origin === 'subagent' && current.parentId !== undefined
            && !seen.has(current.id)) {
            seen.add(current.id);
            const aggregate = indexed.get(current.parentId);
            if (aggregate === undefined) {
                indexed.set(current.parentId, {
                    count: 1,
                    runningCount: descendant.running ? 1 : 0,
                });
            }
            else {
                aggregate.count += 1;
                if (descendant.running)
                    aggregate.runningCount += 1;
            }
            current = summaries[current.parentId];
        }
    }
    return indexed;
}
//# sourceMappingURL=subagent-lineage.js.map