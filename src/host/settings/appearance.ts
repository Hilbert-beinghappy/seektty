/** Harness-owned live configuration for the terminal appearance form. */
import { AppearanceSettingsSchema } from '../management.ts'
import { liveKnownFields } from './live-fields.ts'
export const Config = liveKnownFields(AppearanceSettingsSchema)
export function apply(): void {}
