/** Harness-owned live configuration for the terminal composer-history form. */
import { ComposerHistorySettingsSchema } from '../management.ts'
import { liveKnownFields } from './live-fields.ts'
export const Config = liveKnownFields(ComposerHistorySettingsSchema)
export function apply(): void {}
