/**
 * Composer submission policy. It owns the live busy-Enter
 * preference and resolves keyboard gestures into queue/steer delivery modes;
 * Host and Agent keep the actual delivery-window authority.
 */
import { createSnapshotStore, } from '@deepseek-ai/dsh-client-runtime/client';
import { BUSY_ENTER_FIELD, DEFAULT_BUSY_ENTER_BEHAVIOR } from "../../submission-settings.js";
export { DEFAULT_BUSY_ENTER_BEHAVIOR } from "../../submission-settings.js";
/**
 * Busy-Enter policy used by both the composer inject face and its Settings row.
 * Direct `steer` is intentionally best-effort: AgentLoop turns a closed-window
 * submission into the next waking Queue item.
 */
export class ComposerSubmissionPolicy {
    /** Reactive preference source for the Settings row. */
    busyEnter = createSnapshotStore(DEFAULT_BUSY_ENTER_BEHAVIOR);
    host;
    /**
     * @param host - durable preference scope owned by the providing plugin;
     * absent compositions stay process-local. The adoption subscription shares
     * the scope's plugin lifetime — a disposed scope never publishes again, so
     * the policy needs no release hook.
     */
    constructor(host) {
        this.host = host;
        if (host !== undefined) {
            host.subscribe(() => { this.adopt(host); });
            this.adopt(host);
        }
    }
    /**
     * Resolve one keyboard gesture without changing state.
     * @param running - whether the addressed agent currently reports busy.
     * @param gesture - plain Enter or the Cmd/Ctrl-accelerated chord.
     * @param steeringAvailable - whether this session transport supports steering.
     * @returns Queue outside steer-capable busy state; otherwise the preferred mode or its opposite.
     */
    resolve(running, gesture, steeringAvailable) {
        if (!running || !steeringAvailable)
            return 'queue';
        const preferred = this.busyEnter.getSnapshot();
        if (gesture === 'enter')
            return preferred;
        return preferred === 'queue' ? 'steer' : 'queue';
    }
    /**
     * Change the plain-Enter behavior used during busy state; the live value
     * publishes before the durable write starts.
     * @param behavior - Queue or Steer.
     */
    setBusyEnter(behavior) {
        if (this.busyEnter.getSnapshot() === behavior)
            return;
        this.busyEnter.set(behavior);
        void this.host?.set(BUSY_ENTER_FIELD, behavior);
    }
    /**
     * Adopt the scope's accepted durable behavior without writing it back.
     * @param host - the constructor-narrowed scope driving this adoption.
     */
    adopt(host) {
        const section = host.getSnapshot().value;
        if (section === undefined || this.busyEnter.getSnapshot() === section.busyEnter)
            return;
        this.busyEnter.set(section.busyEnter);
    }
}
//# sourceMappingURL=submission-policy.js.map