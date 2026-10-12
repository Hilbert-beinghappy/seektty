/** Harness-owned live configuration for the terminal welcome form. */
import { WelcomeSettingsSchema } from '../management.ts'
import { liveKnownFields } from './live-fields.ts'
export const Config = liveKnownFields(WelcomeSettingsSchema)
export function apply(): void {}
