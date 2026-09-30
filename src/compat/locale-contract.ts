/** Stateless locale identifiers audited against dsh-client-locale 0.2.0-rc.2.
 * Keep the detached markdown worker free of Host service imports. */
export type { BuiltInLocaleId, LocaleSettings } from '@deepseek-ai/dsh-client-locale'
export const LOCALE_IDS = ['zh', 'en'] as const
export const LOCALE_PREFERENCE_FIELD = 'preference'
export const LOCALE_SETTINGS_NAMESPACE = 'locale'
