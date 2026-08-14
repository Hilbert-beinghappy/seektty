/** Host registration for browser conversation preferences. */
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { CONVERSATION_SETTINGS_NAMESPACE, ConversationSettingsSchema } from "./submission-settings.js";
export { BUSY_ENTER_BEHAVIORS, BUSY_ENTER_FIELD, CONVERSATION_SETTINGS_NAMESPACE, DEFAULT_BUSY_ENTER_BEHAVIOR, } from "./submission-settings.js";
/**
 * Register the durable conversation section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx) {
    ctx.inject(['settings'], (settingsCtx) => {
        settingsCtx.settings.register(settingsNamespace(CONVERSATION_SETTINGS_NAMESPACE), ConversationSettingsSchema);
    });
}
//# sourceMappingURL=index.js.map