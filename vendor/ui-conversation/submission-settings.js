/** Busy-Enter preference stored in the Host user-settings document. */
import z from '@deepseek-ai/schemastery';
/** Settings namespace owned by the conversation plugin. */
export const CONVERSATION_SETTINGS_NAMESPACE = 'ui-conversation';
/** Field carrying the delivery mode for plain Enter while an agent is busy. */
export const BUSY_ENTER_FIELD = 'busyEnter';
/** Busy-Enter behaviors accepted at settings and input boundaries. */
export const BUSY_ENTER_BEHAVIORS = ['queue', 'steer'];
/** Default preserves Enter-as-Queue for running conversations. */
export const DEFAULT_BUSY_ENTER_BEHAVIOR = 'queue';
/** Durable conversation schema; also the wire envelope the browser scope validates against. */
export const ConversationSettingsSchema = z.object({
    [BUSY_ENTER_FIELD]: z.union([...BUSY_ENTER_BEHAVIORS]).default(DEFAULT_BUSY_ENTER_BEHAVIOR),
});
//# sourceMappingURL=submission-settings.js.map