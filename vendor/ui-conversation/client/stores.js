/**
 * Per-session chat store shared by conversation and details registrations.
 * The plugin creates its handle at apply time so identity follows the fiber.
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Declares the per-session chat state and write surface.
 * @returns the store handle.
 */
export function createChatStore() {
    return defineStore({
        // Anchored to the contract shape: consumers read the store through
        // PropsStore<ChatStore>'s SnapshotSelectorHook<ChatStoreState>, so init
        // and the contract cannot drift.
        init: () => ({ selection: null, draft: '', view: null, inspect: null }),
        persist: 'dsh.conversation.chat',
        actions: {
            select: (d, target) => { d.selection = target; },
            setDraft: (d, text) => { d.draft = text; },
            setView: (d, view) => { d.view = view; },
            setInspect: (d, target) => { d.inspect = target; },
        },
    });
}
//# sourceMappingURL=stores.js.map