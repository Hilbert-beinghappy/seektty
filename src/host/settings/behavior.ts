/** Harness-owned live configuration for the terminal behavior form. */
import { BehaviorSettingsSchema } from '../management.ts'
import { liveKnownFields } from './live-fields.ts'
export const Config = liveKnownFields(BehaviorSettingsSchema)
export function apply(): void {}
