/**
 * Goal surface plugin, browser half: the GoalBar entry in the
 * conversation.input.dock strip. Projection-mode surface — the live goal
 * arrives through `useProjection('goal')` (seeded by the history tail page,
 * updated by session/projection frames), so this plugin owns no store, no
 * refresh chain, and no event listener. The inject face carries only the
 * four mutation verbs through the generated Goal Remote API;
 * their CAS ref reads the session's current projected value at call time.
 * Goal creation stays on the /goal host command.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type GoalKey } from './locales.ts';
export { GoalBar, GoalDock } from './GoalBar.tsx';
export type { GoalActionResult, GoalBarActions } from './slots.ts';
export type { GoalKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The goal strip's copy. */
        goal: GoalKey;
    }
}
/** Required services for the Goal dock, command-input projection, Remote mutations, and copy. */
export declare const inject: string[];
/**
 * Client plugin body: the GoalBar dock entry with its mutation verbs.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map