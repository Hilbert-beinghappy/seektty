/** Harness-owned live configuration for the terminal composer-history form. */
import { ComposerHistorySettingsSchema } from '../management.ts'
export const Config = ComposerHistorySettingsSchema.volatile()
export function apply(): void {}
