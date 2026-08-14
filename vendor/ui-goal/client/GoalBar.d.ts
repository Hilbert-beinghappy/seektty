/**
 * GoalBar: the goal indicator docked above the message composer (input dock
 * strip). A present goal shows a goal glyph, a phase label, the truncated
 * objective, and icon actions — resume when paused, edit (inline form in the
 * same strip), and clear. Goal creation lives on the `/goal` command, not
 * here: loading (undefined), no goal (null), and complete goals render
 * nothing. Live state arrives as the projected whole snapshot; the verbs are
 * the injected face.
 */
import type { GoalSnapshot } from '@deepseek-ai/dsh-goal/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { GoalBarActions } from './slots.ts';
export interface GoalBarProps extends GoalBarActions {
    /** Current goal snapshot; undefined = capability absent or loading, null = no goal set. */
    goal: GoalSnapshot | null | undefined;
}
export declare function GoalBar({ goal, onEdit, onPause, onResume, onClear, t }: GoalBarProps & PropsLocale<'goal'>): import("react").JSX.Element | null;
/** Full props of the dock entry: InputZone owner share + session standard kit + injected verbs + the locale seat. */
export type GoalDockProps = import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'> & GoalBarActions & PropsLocale<'goal'>;
/** Dock adapter: reads the host-computed 'goal' projection (whole value; absent or null renders nothing). */
export declare function GoalDock({ useProjection, onEdit, onPause, onResume, onClear, t }: GoalDockProps): import("react").JSX.Element;
//# sourceMappingURL=GoalBar.d.ts.map